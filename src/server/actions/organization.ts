/**
 * Organization + membership actions.
 *
 * createOrganization and upsertOrgMember need the admin secret for reasons that
 * are structural rather than convenient:
 *   * a brand-new user is not yet a member of anything, so no row-level
 *     permission can authorise their first membership row;
 *   * resolving an email address to a user id requires reading auth.users beyond
 *     what any tenant is allowed to see.
 *
 * Everything else about members (listing, re-roling, removal) is a plain GraphQL
 * mutation governed by the org_members permissions, precisely so that these
 * privileged paths stay as small as possible.
 */
import { randomBytes } from 'node:crypto';
import { ActionError, requireOrgRole, requireUserId, type Caller, type OrgRole } from '../auth';
import { adminGraphql } from '../hasura';
import { serverEnv } from '../env';
import { publicBaseUrl } from '../request-url';
import { optionalString, requireUuid } from './shared';

export interface CreateOrganizationInput {
  name: string;
}

export interface CreateOrganizationOutput {
  org_id: string;
  name: string;
  slug: string;
  role: string;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const stem = base.length >= 2 ? base : 'org';
  return `${stem}-${randomBytes(3).toString('hex')}`;
}

export async function createOrganization(
  input: CreateOrganizationInput,
  caller: Caller,
): Promise<CreateOrganizationOutput> {
  const userId = requireUserId(caller);
  const name = optionalString(input.name, 80);
  if (!name || name.length < 2) {
    throw new ActionError('BAD_REQUEST', 'Organization name must be at least 2 characters.', 400);
  }

  // One nested insert = one transaction, so an organization can never exist
  // without an owner.
  const data = await adminGraphql<{
    insert_organizations_one: { id: string; name: string; slug: string };
  }>(
    `mutation CreateOrganization($object: organizations_insert_input!) {
       insert_organizations_one(object: $object) { id name slug }
     }`,
    {
      object: {
        name,
        slug: slugify(name),
        created_by: userId,
        org_members: { data: [{ user_id: userId, role: 'owner', invited_by: userId }] },
      },
    },
  );

  const org = data.insert_organizations_one;
  return { org_id: org.id, name: org.name, slug: org.slug, role: 'owner' };
}

export interface UpsertOrgMemberInput {
  org_id: string;
  email: string;
  role: string;
}

export interface OrgMemberOutput {
  org_member_id: string;
  user_id: string;
  email: string;
  role: string;
}

const ORG_ROLES: OrgRole[] = ['owner', 'editor', 'viewer'];

export async function upsertOrgMember(
  input: UpsertOrgMemberInput,
  caller: Caller,
): Promise<OrgMemberOutput> {
  const userId = requireUserId(caller);
  const orgId = requireUuid(input.org_id, 'org_id');
  const email = optionalString(input.email, 320)?.toLowerCase();
  const role = optionalString(input.role, 16) as OrgRole | null;

  if (!email || !email.includes('@')) {
    throw new ActionError('BAD_REQUEST', 'A valid email address is required.', 400);
  }
  if (!role || !ORG_ROLES.includes(role)) {
    throw new ActionError('BAD_REQUEST', `role must be one of ${ORG_ROLES.join(', ')}.`, 400);
  }

  // Only an owner of this organization may change its membership.
  await requireOrgRole(userId, orgId, ['owner']);

  const found = await adminGraphql<{ users: Array<{ id: string; email: string }> }>(
    `query FindUserByEmail($email: citext!) {
       users(where: { email: { _eq: $email } }, limit: 1) { id email }
     }`,
    { email },
  );
  const target = found.users[0];
  if (!target) {
    throw new ActionError(
      'USER_NOT_FOUND',
      `No account exists for ${email}. They need to sign up first.`,
      404,
    );
  }

  const upserted = await adminGraphql<{
    insert_org_members_one: { id: string; role: OrgRole };
  }>(
    `mutation UpsertMember($object: org_members_insert_input!) {
       insert_org_members_one(
         object: $object
         on_conflict: { constraint: org_members_org_id_user_id_key, update_columns: [role] }
       ) { id role }
     }`,
    {
      object: { org_id: orgId, user_id: target.id, role, invited_by: userId },
    },
  );

  return {
    org_member_id: upserted.insert_org_members_one.id,
    user_id: target.id,
    email: target.email,
    role: upserted.insert_org_members_one.role,
  };
}

export interface GetWebhookEndpointInput {
  trigger_id: string;
}

export interface WebhookEndpointOutput {
  trigger_id: string;
  graphql_endpoint: string;
  rest_endpoint: string;
  secret: string;
  sample_curl: string;
}

/**
 * The only path by which a webhook secret leaves the database, restricted to
 * owners of the organization that owns the trigger.
 */
export async function getWebhookEndpoint(
  input: GetWebhookEndpointInput,
  caller: Caller,
): Promise<WebhookEndpointOutput> {
  const userId = requireUserId(caller);
  const triggerId = requireUuid(input.trigger_id, 'trigger_id');

  const data = await adminGraphql<{
    workflow_triggers_by_pk: {
      id: string;
      type: string;
      secret: string;
      workflow: { org_id: string };
    } | null;
  }>(
    `query LoadTriggerSecret($id: uuid!) {
       workflow_triggers_by_pk(id: $id) {
         id
         type
         secret
         workflow { org_id }
       }
     }`,
    { id: triggerId },
  );

  const trigger = data.workflow_triggers_by_pk;
  if (!trigger) {
    throw new ActionError('NOT_FOUND', 'Not found, or you do not have access to it.', 404);
  }
  await requireOrgRole(userId, trigger.workflow.org_id, ['owner']);

  if (trigger.type !== 'webhook') {
    throw new ActionError('NOT_A_WEBHOOK', 'This trigger is not a webhook trigger.', 400);
  }

  const graphqlEndpoint = serverEnv.graphqlUrl;
  // Built from the host this request actually arrived on, so the URL an owner
  // copies works even when APP_BASE_URL still points at wherever the app used to
  // live. See src/server/request-url.ts.
  const restEndpoint = `${await publicBaseUrl()}/api/webhooks/${trigger.id}`;
  const sampleCurl = [
    `curl -sS -X POST '${graphqlEndpoint}' \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '${JSON.stringify({
      query:
        'mutation ($id: uuid!, $secret: String!, $payload: jsonb) { triggerWorkflowWebhook(trigger_id: $id, secret: $secret, payload: $payload) { workflow_run_id status } }',
      variables: {
        id: trigger.id,
        secret: trigger.secret,
        payload: { text: 'Hello from an external system' },
      },
    })}'`,
  ].join('\n');

  return {
    trigger_id: trigger.id,
    graphql_endpoint: graphqlEndpoint,
    rest_endpoint: restEndpoint,
    secret: trigger.secret,
    sample_curl: sampleCurl,
  };
}

export interface RotateWebhookSecretInput {
  trigger_id: string;
}

export interface WebhookSecretOutput {
  trigger_id: string;
  rest_endpoint: string;
  secret: string;
}

/**
 * Replaces a webhook trigger's secret.
 *
 * A secret that can never be changed is a secret you can never un-leak: once it
 * has been pasted into a chat or committed to somebody else's repository, the only
 * remedies without this are deleting the trigger (which changes its URL and
 * breaks every caller) or leaving it compromised.
 *
 * It has to be an Action rather than a plain mutation for the same reason reading
 * it does: `secret` is not in any select or update permission, so no role can
 * write it either. The new value is generated here — never accepted from the
 * caller — and every previously issued secret stops working the moment this
 * returns.
 */
export async function rotateWebhookSecret(
  input: RotateWebhookSecretInput,
  caller: Caller,
): Promise<WebhookSecretOutput> {
  const userId = requireUserId(caller);
  const triggerId = requireUuid(input.trigger_id, 'trigger_id');

  const data = await adminGraphql<{
    workflow_triggers_by_pk: {
      id: string;
      type: string;
      workflow: { org_id: string };
    } | null;
  }>(
    `query LoadTriggerForRotate($id: uuid!) {
       workflow_triggers_by_pk(id: $id) {
         id
         type
         workflow { org_id }
       }
     }`,
    { id: triggerId },
  );

  const trigger = data.workflow_triggers_by_pk;
  if (!trigger) {
    throw new ActionError('NOT_FOUND', 'Not found, or you do not have access to it.', 404);
  }
  await requireOrgRole(userId, trigger.workflow.org_id, ['owner']);

  if (trigger.type !== 'webhook') {
    throw new ActionError('NOT_A_WEBHOOK', 'This trigger is not a webhook trigger.', 400);
  }

  // Same shape as the column default: 24 random bytes, hex-encoded.
  const secret = randomBytes(24).toString('hex');
  await adminGraphql(
    `mutation RotateSecret($id: uuid!, $secret: String!) {
       update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: { secret: $secret }) { id }
     }`,
    { id: triggerId, secret },
  );

  return {
    trigger_id: trigger.id,
    rest_endpoint: `${await publicBaseUrl()}/api/webhooks/${trigger.id}`,
    secret,
  };
}
