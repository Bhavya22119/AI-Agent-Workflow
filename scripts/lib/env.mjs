/**
 * Environment loading for the setup / seed / verify scripts.
 *
 * Reads .env.local then .env (first definition wins, matching Next.js), with
 * real process env taking precedence over both. No dotenv dependency.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = {
  ...parseEnvFile(resolve(ROOT, '.env')),
  ...parseEnvFile(resolve(ROOT, '.env.local')),
};

/** Read an env var from the real environment, falling back to the .env files. */
export function env(key, fallback = undefined) {
  const value = process.env[key] ?? fileEnv[key];
  return value === undefined || value === '' ? fallback : value;
}

export function requireEnv(key, hint = '') {
  const value = env(key);
  if (!value) {
    throw new Error(
      `Missing required environment variable ${key}.${hint ? ` ${hint}` : ''}\n` +
        `Add it to .env.local (see .env.example).`
    );
  }
  return value;
}

const subdomain = env('NHOST_SUBDOMAIN') ?? env('NEXT_PUBLIC_NHOST_SUBDOMAIN');
const region = env('NHOST_REGION') ?? env('NEXT_PUBLIC_NHOST_REGION');

function serviceUrl(service, path) {
  const override = env(`NHOST_${service.toUpperCase()}_URL`);
  if (override) return override.replace(/\/+$/, '') + path;
  if (!subdomain || !region) {
    throw new Error(
      'Missing NEXT_PUBLIC_NHOST_SUBDOMAIN / NEXT_PUBLIC_NHOST_REGION. See .env.example.'
    );
  }
  // Nhost Cloud host layout. `hasura.<region>` also serves /v1/metadata and
  // /v2/query, which the setup scripts need, so all admin traffic uses it.
  const host = service === 'hasura' ? 'hasura' : service;
  return `https://${subdomain}.${host}.${region}.nhost.run${path}`;
}

export const config = {
  root: ROOT,
  subdomain,
  region,
  get adminSecret() {
    return requireEnv('NHOST_ADMIN_SECRET', 'It is the Hasura admin secret of your Nhost project.');
  },
  graphqlUrl: () => serviceUrl('hasura', '/v1/graphql'),
  metadataUrl: () => serviceUrl('hasura', '/v1/metadata'),
  queryUrl: () => serviceUrl('hasura', '/v2/query'),
  authUrl: () => serviceUrl('auth', '/v1'),
  appBaseUrl: () => (env('APP_BASE_URL') ?? 'http://localhost:3000').replace(/\/+$/, ''),
};

export { fileEnv };
