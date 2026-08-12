/**
 * Where this app actually lives, as seen from the request being handled.
 *
 * `APP_BASE_URL` is what Hasura is told to call, so it has to exist — but it is
 * also the thing most likely to be stale, because it is set once when metadata is
 * applied and then the app moves (a first deploy, a new preview URL, a custom
 * domain). A webhook URL built from a stale value is worse than no URL at all: it
 * looks copy-pasteable and silently points at somebody's laptop.
 *
 * The request itself knows better. Whatever host the caller reached us on is, by
 * definition, a host that resolves to this deployment, so it is preferred over
 * the environment variable whenever the two disagree.
 *
 * The Host header is caller-controlled in general. That is acceptable here
 * because the value is only ever echoed back to the authenticated owner who made
 * the request: poisoning it misleads nobody but the sender.
 */
import { headers } from 'next/headers';
import { serverEnv } from './env';

function isLocal(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
}

/**
 * The public base URL for links handed back to a caller, e.g. a webhook
 * endpoint. Falls back to APP_BASE_URL when the request headers are unavailable.
 */
export async function publicBaseUrl(): Promise<string> {
  const configured = serverEnv.appBaseUrl;

  let fromRequest: string | null = null;
  try {
    const list = await headers();
    const host = list.get('x-forwarded-host') ?? list.get('host');
    if (host) {
      const proto =
        list.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
        (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(host) ? 'http' : 'https');
      fromRequest = `${proto}://${host}`.replace(/\/+$/, '');
    }
  } catch {
    // Called outside a request scope; the configured value is all we have.
  }

  if (!fromRequest) return configured;
  // A configured non-local URL is deliberate (a custom domain, say) and wins over
  // a request that arrived on a deployment-internal hostname. Otherwise the
  // request is the more trustworthy of the two.
  if (!isLocal(configured) && !isLocal(fromRequest)) return configured;
  return fromRequest;
}
