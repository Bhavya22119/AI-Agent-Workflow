/**
 * The Nhost browser client (SDK v4).
 *
 * v4 has no React bindings, which is fine — the session lives in
 * `nhost.sessionStorage`, which exposes an onChange subscription, so the auth
 * provider can bind it to React with useSyncExternalStore in a few lines and we
 * avoid depending on the deprecated @nhost/react package.
 */
import { createClient, type NhostClient } from '@nhost/nhost-js';

const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
const region = process.env.NEXT_PUBLIC_NHOST_REGION;

if (!subdomain || !region) {
  throw new Error(
    'Missing NEXT_PUBLIC_NHOST_SUBDOMAIN / NEXT_PUBLIC_NHOST_REGION. Copy .env.example to .env.local.',
  );
}

export const nhost: NhostClient = createClient({ subdomain, region });

export const NHOST_SUBDOMAIN = subdomain;
export const NHOST_REGION = region;

export const GRAPHQL_HTTP_URL = `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;
export const GRAPHQL_WS_URL = `wss://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;

export function getAccessToken(): string | null {
  return nhost.getUserSession()?.accessToken ?? null;
}
