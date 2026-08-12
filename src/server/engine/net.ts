/**
 * Outbound HTTP for http_request steps.
 *
 * A workflow step that fetches "any external API" is, from the host's point of
 * view, an attacker-controlled URL executed by trusted infrastructure. So before
 * any request is made the target is checked:
 *
 *   * only http/https,
 *   * the hostname is resolved and every returned address must be public —
 *     which blocks localhost, RFC1918 ranges, link-local, and in particular the
 *     169.254.169.254 cloud metadata endpoint,
 *   * redirects are not followed automatically; a redirect is surfaced as a
 *     normal response so it cannot bounce the request into private space.
 *
 * Set ALLOW_PRIVATE_HTTP_TARGETS=true to relax this while developing against a
 * service on your own machine.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { serverEnv } from '../env';

export class UnsafeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeTargetError';
  }
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier NAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe80')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  // IPv4-mapped, e.g. ::ffff:127.0.0.1
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeTargetError(`"${rawUrl}" is not a valid absolute URL.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeTargetError(`Unsupported protocol "${url.protocol}" (use http or https).`);
  }
  if (serverEnv.allowPrivateHttpTargets) return url;

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses: string[] = isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true, verbatim: true }).catch(() => {
        throw new UnsafeTargetError(`Could not resolve host "${hostname}".`);
      })).map((entry) => entry.address);

  if (!addresses.length) {
    throw new UnsafeTargetError(`Could not resolve host "${hostname}".`);
  }
  const blocked = addresses.filter(isPrivateAddress);
  if (blocked.length) {
    throw new UnsafeTargetError(
      `Refusing to call a private or reserved address (${blocked.join(', ')}). ` +
        'Set ALLOW_PRIVATE_HTTP_TARGETS=true to allow this in development.',
    );
  }
  return url;
}

export interface TimedFetchResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
  contentType: string | null;
}

/** fetch() with a hard timeout, no automatic redirects, and a parsed body. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<TimedFetchResult> {
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type');
  const text = await res.text();
  let body: unknown = text;
  if (contentType?.includes('json')) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  } else if (text.length > 8000) {
    body = `${text.slice(0, 8000)}… [truncated]`;
  }

  return {
    status: res.status,
    ok: res.ok,
    headers: Object.fromEntries(res.headers.entries()),
    body: body as TimedFetchResult['body'],
    contentType,
  };
}
