/**
 * A trigger's settings, normalised.
 *
 * `workflow_triggers.config` is a JSONB column, which is right for a table that
 * has to hold four different kinds of trigger — but it means every reader has to
 * agree on the keys and the defaults. This module is that agreement, and it is
 * shared by the builder, the REST endpoint and the Action handler so a webhook
 * cannot be validated one way and displayed another.
 *
 * Defaults are chosen so a trigger created before these settings existed behaves
 * exactly as it did: POST, secret in the `x-webhook-secret` header, answer
 * immediately.
 */
import type { Json } from './types';

export type WebhookMethod = 'POST' | 'GET' | 'PUT' | 'PATCH';
export type WebhookAuth = 'header' | 'query' | 'bearer';
export type WebhookResponse = 'immediate' | 'when_finished';

export const WEBHOOK_METHODS: WebhookMethod[] = ['POST', 'GET', 'PUT', 'PATCH'];

export interface WebhookSettings {
  method: WebhookMethod;
  auth: WebhookAuth;
  response: WebhookResponse;
  /** Payload keys that must be present, or the call is refused with 400. */
  requireFields: string[];
}

const DEFAULTS: WebhookSettings = {
  method: 'POST',
  auth: 'header',
  response: 'immediate',
  requireFields: [],
};

function readString(config: Record<string, Json> | null | undefined, key: string): string {
  const value = config?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Reads a trigger's webhook settings, filling in the defaults. */
export function webhookSettings(
  config: Record<string, Json> | null | undefined,
): WebhookSettings {
  const method = readString(config, 'method').toUpperCase() as WebhookMethod;
  const auth = readString(config, 'auth').toLowerCase() as WebhookAuth;
  const response = readString(config, 'response').toLowerCase() as WebhookResponse;

  const rawFields = config?.require_fields;
  const requireFields = Array.isArray(rawFields)
    ? rawFields
        .map((field) => (typeof field === 'string' ? field.trim() : ''))
        .filter((field) => field.length > 0)
    : [];

  return {
    method: WEBHOOK_METHODS.includes(method) ? method : DEFAULTS.method,
    auth: auth === 'query' || auth === 'bearer' ? auth : DEFAULTS.auth,
    response: response === 'when_finished' ? response : DEFAULTS.response,
    requireFields,
  };
}

/** How the secret is presented, for the docs shown next to the endpoint. */
export function authDescription(auth: WebhookAuth): string {
  switch (auth) {
    case 'query':
      return '?secret=… in the query string';
    case 'bearer':
      return 'Authorization: Bearer … header';
    default:
      return 'x-webhook-secret header';
  }
}

/**
 * The name shown on the canvas and in the inspector. Two webhook triggers on the
 * same workflow are otherwise indistinguishable, which makes it impossible to
 * tell which one an external system is calling.
 */
export function triggerDisplayName(
  trigger: { type: string; config?: Record<string, Json> | null; id?: string },
  fallback: string,
): string {
  const label = readString(trigger.config, 'label');
  if (label) return label;
  return fallback;
}

/** A short, stable identifier for an unnamed trigger: the tail of its row id. */
export function triggerShortId(trigger: { id?: string; key?: string }): string | null {
  const source = trigger.id ?? null;
  return source ? source.slice(0, 8) : null;
}

/** A ready-to-run curl for a webhook, matching how it is actually configured. */
export function webhookCurl(options: {
  endpoint: string;
  secret: string;
  settings: WebhookSettings;
  body: string;
  multiline?: boolean;
}): string {
  const { endpoint, secret, settings, body, multiline = true } = options;
  const sendsBody = settings.method !== 'GET';
  const url =
    settings.auth === 'query'
      ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}secret=${encodeURIComponent(secret)}`
      : endpoint;

  const parts = [`curl -X ${settings.method} '${url}'`];
  if (settings.auth === 'header') parts.push(`-H 'x-webhook-secret: ${secret}'`);
  if (settings.auth === 'bearer') parts.push(`-H 'authorization: Bearer ${secret}'`);
  if (sendsBody) {
    parts.push(`-H 'content-type: application/json'`);
    parts.push(`-d '${body.replace(/\s+/g, ' ').trim()}'`);
  }

  return multiline ? parts.join(' \\\n  ') : parts.join(' ');
}
