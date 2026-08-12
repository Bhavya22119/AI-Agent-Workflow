/**
 * Shared plumbing that turns an action function into a Next.js Route Handler
 * speaking Hasura's Action protocol.
 *
 * Success -> 200 with the output object (Hasura maps it onto the output type).
 * Failure -> the ActionError's status plus { message, extensions.code }, which
 * Hasura surfaces to the GraphQL client as a normal error entry.
 */
import { ActionError, parseActionRequest, type Caller } from '../auth';
import { GraphQLRequestError } from '../hasura';
import { RunStartError } from '../engine/store';

export type ActionHandler<TInput, TOutput> = (
  input: TInput,
  caller: Caller,
) => Promise<TOutput>;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ message, extensions: { code } }, { status });
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
        return errorResponse(500, 'DATABASE_ERROR', 'The database rejected this operation.');
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[action:${name}] unexpected failure:`, message);
      return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong handling this action.');
    }
  };
}
