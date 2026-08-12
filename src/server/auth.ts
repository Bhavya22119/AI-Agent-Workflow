/**
 * Caller identification and authorization for Action / Event handlers.
 *
 * ============================================================================
 *  The rule that matters
 * ============================================================================
 *  A caller's identity is NEVER read from the request body. It comes from one
 *  of exactly two places, both of which involve a signature or a secret:
 *
 *   1. `hasura-action` transport — the request carries a correct
 *      x-hasura-action-secret, which proves it originated from our Hasura
 *      instance. Hasura has already validated the user's JWT, so the verified
 *      identity in `session_variables` can be trusted.
 *
 *   2. `bearer` transport — the request carries an Authorization: Bearer <JWT>.
 *      The token is verified by asking Nhost Auth who it belongs to; the answer
 *      is the identity. `session_variables` in the body is ignored entirely in
 *      this mode, so a forged body proves nothing.
 *
 *  Anything else is anonymous, and every handler except the public inbound
 *  webhook rejects anonymous callers.
 *
 *  The rule matters because the shortcut is so easy to reach for: an approve
 *  endpoint that trusts a `user_id` field in its POST body lets anybody resume
 *  anybody else's paused run by guessing a UUID.
 */
import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from './env';
import { adminGraphql } from './hasura';

export type OrgRole = 'owner' | 'editor' | 'viewer';

export const ROLE_RANK: Record<OrgRole, number> = { viewer: 0, editor: 1, owner: 2 };

/** An error with a machine-readable code, surfaced to GraphQL clients. */
export class ActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

export type Transport = 'hasura-action' | 'bearer' | 'anonymous';

export interface Caller {
  userId: string | null;
  hasuraRole: string;
  transport: Transport;
}

export interface ActionRequest<TInput> {
  name: string;
  input: TInput;
  caller: Caller;
}

/** Constant-time secret comparison that tolerates differing lengths. */
export function secretsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Ask Nhost Auth to validate an access token and tell us who it belongs to. */
async function identifyBearer(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${serverEnv.authUrl}/user`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user?.id ?? null;
  } catch {
    return null;
  }
}

interface HasuraActionBody<TInput> {
  action?: { name?: string };
  input?: TInput;
  session_variables?: Record<string, string>;
}

/**
 * Parses a Hasura Action request and resolves the caller. Works for both
 * transports, so the handler logic below it is identical either way.
 */
export async function parseActionRequest<TInput = Record<string, unknown>>(
  req: Request,
  fallbackName: string,
): Promise<ActionRequest<TInput>> {
  let body: HasuraActionBody<TInput>;
  try {
    body = (await req.json()) as HasuraActionBody<TInput>;
  } catch {
    throw new ActionError('BAD_REQUEST', 'Request body must be JSON.', 400);
  }

  const name = body.action?.name ?? fallbackName;
  // Direct callers may post the input at the top level for convenience.
  const input = (body.input ?? (body as unknown as TInput)) as TInput;

  const providedActionSecret = req.headers.get('x-hasura-action-secret') ?? undefined;
  if (serverEnv.actionSecret && secretsMatch(providedActionSecret, serverEnv.actionSecret)) {
    const session = body.session_variables ?? {};
    return {
      name,
      input,
      caller: {
        userId: session['x-hasura-user-id'] ?? null,
        hasuraRole: session['x-hasura-role'] ?? 'public',
        transport: 'hasura-action',
      },
    };
  }

  if (providedActionSecret) {
    // A wrong secret is a spoofing attempt, not a fallback path — never fall
    // through to the bearer branch here.
    //
    // But there are two ways to arrive: an attacker guessing, and a deployment
    // whose HASURA_ACTION_SECRET does not match the value baked into the Hasura
    // metadata. The second is overwhelmingly more common and used to surface as a
    // bare "Invalid action secret", which reads as "the caller is wrong" and sends
    // whoever is deploying to look in the wrong place. Naming the misconfiguration
    // tells an attacker nothing they did not already know — they sent the secret,
    // so they know it was rejected.
    if (!serverEnv.actionSecret) {
      console.error(
        '[auth] HASURA_ACTION_SECRET is not set on this deployment, but Hasura sent one.',
      );
      // 400, not 500: Hasura discards the body of any 5xx and hands the client a
      // bare "internal error", which is precisely the message this exists to avoid.
      throw new ActionError(
        'MISCONFIGURED',
        'This deployment has no HASURA_ACTION_SECRET set, so it cannot verify that the ' +
          'request came from Hasura. Set it to the same value used when the metadata was applied.',
        400,
      );
    }
    console.error('[auth] action secret mismatch — deployment and Hasura metadata disagree.');
    // A distinct code, not UNAUTHENTICATED: the client fails over to the bearer
    // transport on this, and must not do that for a caller who is simply signed out.
    throw new ActionError(
      'ACTION_SECRET_MISMATCH',
      "This deployment's HASURA_ACTION_SECRET does not match the one in the Hasura metadata. " +
        'Re-apply the metadata, or correct the value on the deployment.',
      401,
    );
  }

  const authorization = req.headers.get('authorization');
  const bearer = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : null;

  if (bearer) {
    const userId = await identifyBearer(bearer);
    if (!userId) {
      throw new ActionError('UNAUTHENTICATED', 'Access token is invalid or expired.', 401);
    }
    return {
      name,
      input,
      caller: { userId, hasuraRole: 'user', transport: 'bearer' },
    };
  }

  return { name, input, caller: { userId: null, hasuraRole: 'public', transport: 'anonymous' } };
}

/** Requires an authenticated caller. */
export function requireUserId(caller: Caller): string {
  if (!caller.userId) {
    throw new ActionError('UNAUTHENTICATED', 'You must be signed in to do this.', 401);
  }
  return caller.userId;
}

/**
 * Layer 1, in the handler: the caller must be a member of this organization,
 * with one of the allowed org roles. Returns their actual role.
 *
 * Note the failure message deliberately does not distinguish "this org does not
 * exist" from "you are not a member of it", so the endpoint cannot be used to
 * probe for the existence of another tenant's organization.
 */
export async function requireOrgRole(
  userId: string,
  orgId: string,
  allowed: readonly OrgRole[],
): Promise<OrgRole> {
  const data = await adminGraphql<{
    org_members: Array<{ role: OrgRole }>;
  }>(
    `query MemberRole($userId: uuid!, $orgId: uuid!) {
       org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }, limit: 1) {
         role
       }
     }`,
    { userId, orgId },
  );

  const role = data.org_members[0]?.role;
  if (!role) {
    throw new ActionError(
      'FORBIDDEN',
      'You do not have access to this organization.',
      403,
    );
  }
  if (!allowed.includes(role)) {
    throw new ActionError(
      'FORBIDDEN',
      `Your role (${role}) is not allowed to do this. Required: ${allowed.join(' or ')}.`,
      403,
    );
  }
  return role;
}

/** Verifies a request came from a Hasura Event Trigger or Cron Trigger. */
export function assertHasuraEvent(req: Request): void {
  const provided = req.headers.get('x-hasura-event-secret') ?? undefined;
  if (!serverEnv.webhookSecret) {
    // 4xx so Hasura stops retrying: a missing environment variable is not a
    // transient fault, and burning the retry budget on it only delays the real
    // events behind it.
    throw new ActionError(
      'MISCONFIGURED',
      'HASURA_WEBHOOK_SECRET is not set on this deployment, so it cannot verify that the ' +
        'event came from Hasura. Set it to the same value used when the metadata was applied.',
      400,
    );
  }
  if (!secretsMatch(provided, serverEnv.webhookSecret)) {
    throw new ActionError('UNAUTHENTICATED', 'Invalid event secret.', 401);
  }
}
