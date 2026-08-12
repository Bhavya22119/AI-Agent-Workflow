/**
 * Reading an organization's LLM connections, including the API key.
 *
 * This is the only place `llm_connections.api_key` is ever selected, and it uses
 * the admin secret because no role has select permission on that column.
 *
 * Every lookup is scoped by `org_id` as well as `id`. That is not belt-and-braces:
 * a step's `connection_id` is just a value inside a JSONB config, and a workflow's
 * config is editable by any editor in its org. Without the org predicate, pasting
 * another tenant's connection id into a step would spend their API key — the same
 * class of hole as guessing a workflow id, one level down.
 */
import { adminGraphql } from '../hasura';
import { isLlmProtocol } from '@/lib/llm-providers';
import type { LlmConnection } from './llm';

interface ConnectionRow {
  id: string;
  name: string;
  provider: string;
  protocol: string;
  base_url: string | null;
  default_model: string | null;
  api_key: string;
}

const CONNECTION_FIELDS = `id name provider protocol base_url default_model api_key`;

function toConnection(row: ConnectionRow): LlmConnection {
  if (!isLlmProtocol(row.protocol)) {
    throw new Error(
      `Connection "${row.name}" has an unsupported API format "${row.protocol}".`,
    );
  }
  return {
    id: row.id,
    name: row.name,
    vendor: row.provider,
    protocol: row.protocol,
    base_url: row.base_url,
    default_model: row.default_model,
    api_key: row.api_key,
  };
}

/** One connection, or null when it does not exist *in this organization*. */
export async function loadLlmConnection(
  orgId: string,
  connectionId: string,
): Promise<LlmConnection | null> {
  const data = await adminGraphql<{ llm_connections: ConnectionRow[] }>(
    `query LoadLlmConnection($id: uuid!, $orgId: uuid!) {
       llm_connections(where: { id: { _eq: $id }, org_id: { _eq: $orgId } }, limit: 1) {
         ${CONNECTION_FIELDS}
       }
     }`,
    { id: connectionId, orgId },
  );
  const row = data.llm_connections[0];
  return row ? toConnection(row) : null;
}
