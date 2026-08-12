/**
 * Thin admin clients for Hasura's GraphQL, metadata and SQL endpoints, used by
 * the setup / seed / verify scripts.
 */
import { config, env } from './env.mjs';

const JSON_HEADERS = { 'content-type': 'application/json' };

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${url} -> ${res.status} (non-JSON response): ${text.slice(0, 400)}`);
  }
  return { res, json };
}

/** GraphQL request with the admin secret (bypasses all permissions). */
export async function adminGql(query, variables = {}) {
  const { json } = await post(config.graphqlUrl(), { query, variables }, {
    'x-hasura-admin-secret': config.adminSecret,
  });
  if (json?.errors) {
    throw new Error(`GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

/**
 * GraphQL request as a real end user (their access token), i.e. with row-level
 * permissions applied. Returns the raw envelope so callers can assert on errors.
 */
export async function userGql(accessToken, query, variables = {}) {
  const { json } = await post(config.graphqlUrl(), { query, variables }, {
    authorization: `Bearer ${accessToken}`,
  });
  return json;
}

/** GraphQL request with no credentials at all (the unauthorized `public` role). */
export async function anonGql(query, variables = {}) {
  const { json } = await post(config.graphqlUrl(), { query, variables });
  return json;
}

/** Hasura metadata API. */
export async function metadata(type, args = {}) {
  const { res, json } = await post(config.metadataUrl(), { type, args }, {
    'x-hasura-admin-secret': config.adminSecret,
  });
  if (!res.ok) {
    throw new Error(
      `metadata ${type} failed (${res.status}): ${JSON.stringify(json, null, 2).slice(0, 4000)}`
    );
  }
  return json;
}

/** Run SQL through the Hasura /v2/query endpoint. */
export async function runSql(sql, { cascade = false, readOnly = false } = {}) {
  const { res, json } = await post(
    config.queryUrl(),
    {
      type: 'run_sql',
      args: { source: 'default', sql, cascade, read_only: readOnly },
    },
    { 'x-hasura-admin-secret': config.adminSecret }
  );
  if (!res.ok) {
    throw new Error(`run_sql failed (${res.status}): ${JSON.stringify(json)?.slice(0, 4000)}`);
  }
  return json;
}

/** Nhost Auth REST endpoint. */
export async function authRequest(path, body, { method = 'POST', token } = {}) {
  const res = await fetch(`${config.authUrl()}${path}`, {
    method,
    headers: {
      ...JSON_HEADERS,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

/** Call one of the app's Action handlers directly (used by the verify script). */
export async function callActionHandler(action, { input = {}, sessionVariables = null }) {
  const base = config.appBaseUrl();
  const secret = env('HASURA_ACTION_SECRET');
  const res = await fetch(`${base}/api/hasura/actions/${action}`, {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...(secret ? { 'x-hasura-action-secret': secret } : {}),
    },
    body: JSON.stringify({
      action: { name: action },
      input,
      session_variables: sessionVariables ?? {},
      request_query: '',
    }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

export const log = {
  step: (msg) => console.log(`\n\x1b[1m\x1b[36m▸ ${msg}\x1b[0m`),
  ok: (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`),
  warn: (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`),
  fail: (msg) => console.log(`  \x1b[31m✗\x1b[0m ${msg}`),
  info: (msg) => console.log(`    ${msg}`),
};
