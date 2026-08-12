/**
 * "Test connection" for an llm_connection, before or after it is saved.
 *
 * Deliberately NOT a Hasura Action. An Action would route the request through
 * Hasura, which means an API key the user is still typing would travel through a
 * second system and land in its logs; and the form has to be testable *before*
 * the row exists, which an Action reading from the database could not do. So this
 * is a plain app route: same origin, caller verified the same way every Action
 * handler verifies one, and owner-only.
 *
 *   POST /api/llm/test-connection
 *   { org_id, provider, base_url?, api_key?, model?, connection_id? }
 *
 * `api_key` may be omitted when `connection_id` is given — testing a saved
 * connection re-uses the stored key, which is never sent to the browser.
 */
import { ActionError, parseActionRequest, requireOrgRole, requireUserId } from '@/server/auth';
import { loadLlmConnection } from '@/server/engine/connections';
import { callLlm, LlmError, type LlmConnection } from '@/server/engine/llm';
import { requireUuid } from '@/server/actions/shared';
import { isLlmProtocol } from '@/lib/llm-providers';

export const maxDuration = 30;

interface TestConnectionInput {
  org_id?: string;
  connection_id?: string;
  /** Vendor id, for the label in the result. */
  provider?: string;
  /** Wire protocol — what actually decides how the request is built. */
  protocol?: string;
  base_url?: string;
  api_key?: string;
  model?: string;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { input, caller } = await parseActionRequest<TestConnectionInput>(
      req,
      'testLlmConnection',
    );
    const userId = requireUserId(caller);
    const orgId = requireUuid(input.org_id ?? '', 'org_id');

    // Only an owner may create a connection, so only an owner may test one.
    await requireOrgRole(userId, orgId, ['owner']);

    let connection: LlmConnection;

    if (input.api_key && input.api_key.trim()) {
      if (!isLlmProtocol(input.protocol)) {
        throw new ActionError('BAD_REQUEST', 'Pick a provider first.', 400);
      }
      connection = {
        name: 'test',
        vendor: input.provider,
        protocol: input.protocol,
        base_url: input.base_url?.trim() || null,
        default_model: input.model?.trim() || null,
        api_key: input.api_key.trim(),
      };
    } else if (input.connection_id) {
      const saved = await loadLlmConnection(
        orgId,
        requireUuid(input.connection_id, 'connection_id'),
      );
      if (!saved) {
        throw new ActionError('NOT_FOUND', 'That connection no longer exists.', 404);
      }
      // An edit may have changed the endpoint without re-entering the key.
      connection = {
        ...saved,
        protocol: isLlmProtocol(input.protocol) ? input.protocol : saved.protocol,
        base_url: input.base_url?.trim() || saved.base_url,
        default_model: input.model?.trim() || saved.default_model,
      };
    } else {
      throw new ActionError('BAD_REQUEST', 'Enter an API key to test this connection.', 400);
    }

    const started = Date.now();
    const result = await callLlm({
      connection,
      prompt: 'Reply with the single word: ready',
      maxTokens: 8,
      temperature: 0,
      timeoutMs: 20000,
    });

    return Response.json({
      ok: true,
      provider: connection.vendor ?? connection.protocol,
      protocol: connection.protocol,
      model: result.model,
      endpoint: result.endpoint ?? null,
      reply: result.text.slice(0, 200),
      latency_ms: Date.now() - started,
    });
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json(
        { ok: false, message: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof LlmError) {
      // The provider's own words are the most useful thing we can show: a wrong
      // key, a model that does not exist and a blocked base URL all look
      // identical once flattened to "the test failed".
      return Response.json(
        { ok: false, message: error.message, code: 'PROVIDER_REJECTED' },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('[llm:test-connection]', message);
    return Response.json({ ok: false, message }, { status: 400 });
  }
}
