/**
 * Plain REST alias for the webhook trigger.
 *
 * The canonical inbound endpoint is the `triggerWorkflowWebhook` Hasura Action
 * (see nhost/metadata/actions.yaml). This route exists because most external
 * systems — and anyone testing with curl — would rather POST a JSON body to a
 * URL than send a GraphQL mutation. It calls exactly the same handler with the
 * same secret check, so there is no second authorization path to get wrong.
 *
 *   curl -X POST $APP_URL/api/webhooks/<trigger_id> \
 *     -H 'x-webhook-secret: <secret>' \
 *     -H 'content-type: application/json' \
 *     -d '{"text":"Customer says the app keeps crashing"}'
 */
import { ActionError } from '@/server/auth';
import { triggerWorkflowWebhook } from '@/server/actions/triggerWorkflowWebhook';
import { RunStartError } from '@/server/engine/store';
import type { Json } from '@/server/engine/types';

/**
 * An external caller deserves to know *why* it was refused. Without this, a
 * paused workflow answered "500 Could not start the run", which is
 * indistinguishable from a server fault.
 */
const RUN_START_STATUS: Record<string, number> = {
  WORKFLOW_INACTIVE: 409,
  WORKFLOW_HAS_NO_STEPS: 409,
  QUOTA_EXCEEDED: 429,
  WORKFLOW_NOT_FOUND: 404,
};

export const maxDuration = 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ triggerId: string }> },
): Promise<Response> {
  const { triggerId } = await ctx.params;

  let payload: Json = {};
  try {
    const text = await req.text();
    payload = text ? (JSON.parse(text) as Json) : {};
  } catch {
    return Response.json({ message: 'Request body must be JSON.' }, { status: 400 });
  }

  const secret =
    req.headers.get('x-webhook-secret') ??
    new URL(req.url).searchParams.get('secret') ??
    (payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload.secret as string | undefined)
      : undefined) ??
    '';

  // Do not echo the secret back into the run payload.
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'secret' in payload) {
    payload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== 'secret'),
    ) as Json;
  }

  try {
    const result = await triggerWorkflowWebhook({ trigger_id: triggerId, secret, payload });
    return Response.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json(
        { message: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof RunStartError) {
      return Response.json(
        { message: error.message, code: error.code },
        { status: RUN_START_STATUS[error.code] ?? 409 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('[webhook:rest]', message);
    return Response.json({ message: 'Could not start the run.' }, { status: 500 });
  }
}
