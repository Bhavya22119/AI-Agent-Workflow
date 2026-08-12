/**
 * Shared plumbing that turns an action function into a Next.js Route Handler
 * speaking Hasura's Action protocol.
 *
 * Success -> 200 with the output object (Hasura maps it onto the output type).
 * Failure -> a 4xx plus { message, extensions.code }, which Hasura surfaces to
 * the GraphQL client as a normal error entry.
 *
 * ============================================================================
 *  Why nothing here ever returns 5xx
 * ============================================================================
 *  Hasura's Action contract is "2xx or 4xx". Given anything else it discards the
 *  response body entirely and hands the client a bare `internal error`:
 *
 *      expecting 2xx or 4xx status code, but found 500
 *
 *  So a handler that answers 500 — however carefully worded its message — is a
 *  handler whose message nobody will ever read. The detail goes to the server log
 *  and the client gets a 4xx carrying the real text, which is the only way an
 *  operator finds out what broke without shell access to the logs.
 */
import { ActionError, parseActionRequest, type Caller } from '../auth';
import { GraphQLRequestError } from '../hasura';
import { RunStartError } from '../engine/store';

export type ActionHandler<TInput, TOutput> = (
  input: TInput,
  caller: Caller,
) => Promise<TOutput>;

/**
 * Clamped to 4xx: see the note at the top of the file. A 5xx would cost us the
 * message, so a server-side fault is reported as 400 with its code intact rather
 * than as an unexplained `internal error`.
 */
function errorResponse(status: number, code: string, message: string): Response {
  const forwardable = status >= 200 && status < 500 ? status : 400;
  return Response.json({ message, extensions: { code } }, { status: forwardable });
}

export function createActionRoute<TInput, TOutput>(
  name: string,
  handler: ActionHandler<TInput, TOutput>,
): (req: Request) => Promise<Response> {
  return async function POST(req: Request): Promise<Response> {
    try {
      const { input, caller } = await parseActionRequest<TInput>(req, name);
      const output = await handler(input, caller);
      return Response.json(output);
    } catch (error) {
      if (error instanceof ActionError) {
        return errorResponse(error.status, error.code, error.message);
      }
      if (error instanceof RunStartError) {
        const status =
          error.code === 'QUOTA_EXCEEDED'
            ? 429
            : error.code === 'WORKFLOW_NOT_FOUND'
              ? 404
              : error.code === 'WORKFLOW_INACTIVE' || error.code === 'WORKFLOW_HAS_NO_STEPS'
                ? 409
                : 400;
        return errorResponse(status, error.code, error.message);
      }
      if (error instanceof GraphQLRequestError) {
        console.error(`[action:${name}] GraphQL failure:`, error.message);
        return errorResponse(400, 'DATABASE_ERROR', 'The database rejected this operation.');
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[action:${name}] unexpected failure:`, message);
      return errorResponse(400, 'INTERNAL_ERROR', `Something went wrong handling this action: ${message}`);
    }
  };
}
