/**
 * Plain REST alias for the webhook trigger.
 *
 * The canonical inbound endpoint is the `triggerWorkflowWebhook` Hasura Action
 * (see nhost/metadata/actions.yaml). This route exists because most external
 * systems — and anyone testing with curl or Postman — would rather send a JSON
 * body to a URL than a GraphQL mutation. It calls exactly the same handler with
 * the same secret check, so there is no second authorization path to get wrong.
 *
 *   curl -X POST $APP_URL/api/webhooks/<trigger_id> \
 *     -H 'x-webhook-secret: <secret>' \
 *     -H 'content-type: application/json' \
 *     -d '{"text":"Customer says the app keeps crashing"}'
 *
 * ---------------------------------------------------------------------------
 *  Why all four verbs are exported
 * ---------------------------------------------------------------------------
 *  Each trigger declares which method it accepts. Exporting only POST would make
 *  a trigger configured for PUT answer 405 from the framework, before the handler
 *  could say which method it *does* want — so every verb is accepted here and the
 *  trigger's own setting decides, with a message that names the right one.
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

/**
 * The secret, from wherever this trigger is configured to expect it. All three
 * places are read regardless of the setting: a caller who sends it correctly for
 * one mode should not be told "unauthorized" because the trigger prefers another,
 * and the value is verified in constant time either way.
 */
function extractSecret(req: Request, url: URL, payload: Json): string {
  const authorization = req.headers.get('authorization') ?? '';
  const bearer = /^bearer\s+/i.test(authorization) ? authorization.replace(/^bearer\s+/i, '').trim() : '';

  const fromBody =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, Json>).secret
      : undefined;

  return (
    req.headers.get('x-webhook-secret') ??
    url.searchParams.get('secret') ??
    (bearer || undefined) ??
    (typeof fromBody === 'string' ? fromBody : undefined) ??
    ''
  );
}

/** GET has no body, so its query string (minus the secret) becomes the payload. */
function payloadFromQuery(url: URL): Json {
  const entries: Record<string, Json> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'secret') continue;
    entries[key] = value;
  }
  return entries;
}

async function handle(req: Request, triggerId: string): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();

  let payload: Json = {};
  if (method === 'GET') {
    payload = payloadFromQuery(url);
  } else {
    try {
      const text = await req.text();
      payload = text ? (JSON.parse(text) as Json) : {};
    } catch {
      return Response.json(
        { message: 'Request body must be JSON.', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }
  }

  const secret = extractSecret(req, url, payload);

  // Do not echo the secret back into the run payload.
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'secret' in payload) {
    payload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== 'secret'),
    ) as Json;
  }

  try {
    const result = await triggerWorkflowWebhook(
      { trigger_id: triggerId, secret, payload },
      { method, canWait: true },
    );

    const body: Record<string, Json> = {
      workflow_run_id: result.workflow_run_id,
      workflow_id: result.workflow_id,
      status: result.status,
      step_count: result.step_count,
    };

    if (result.settings.response === 'when_finished') {
      if (result.finished) {
        body.error = result.finished.error;
        body.duration_ms = result.finished.duration_ms;
        body.output = result.finished.output;
        body.outputs = result.finished.outputs as unknown as Json;
        // 200 for a finished run, 202 for one that paused at an approval gate:
        // the caller's request was accepted but the work is not done.
        const status =
          result.finished.status === 'completed'
            ? 200
            : result.finished.status === 'failed'
              ? 502
              : 202;
        return Response.json(body, { status });
      }
      // The wait budget ran out; the run continues in the background.
      body.note = 'Still running — poll the run, or watch it in the app.';
      return Response.json(body, { status: 202 });
    }

    return Response.json(body, { status: 202 });
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json({ message: error.message, code: error.code }, { status: error.status });
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

type RouteContext = { params: Promise<{ triggerId: string }> };

export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  return handle(req, (await ctx.params).triggerId);
}

export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  return handle(req, (await ctx.params).triggerId);
}

export async function PUT(req: Request, ctx: RouteContext): Promise<Response> {
  return handle(req, (await ctx.params).triggerId);
}

export async function PATCH(req: Request, ctx: RouteContext): Promise<Response> {
  return handle(req, (await ctx.params).triggerId);
}
