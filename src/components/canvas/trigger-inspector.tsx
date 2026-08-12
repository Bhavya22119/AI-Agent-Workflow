'use client';

/**
 * Trigger configuration.
 *
 * Every trigger type answers the same three questions here: how does it fire,
 * what does it send the workflow, and how do I test it right now.
 *
 * ---------------------------------------------------------------------------
 *  Why a webhook needs more than a URL
 * ---------------------------------------------------------------------------
 *  Two webhook triggers on one workflow are two different endpoints, and the
 *  systems calling them are rarely alike: one posts JSON, another can only manage
 *  a GET; one can set a custom header, another can only put a token in the query
 *  string; one wants an immediate acknowledgement, another wants the answer. So a
 *  webhook here is a name, a verb, where the secret goes, what the payload must
 *  contain, and whether the caller waits — all per trigger, all enforced by the
 *  endpoint rather than merely displayed.
 *
 *  The endpoint and secret are fetched as soon as the panel opens, because a
 *  webhook you cannot find the URL for is not a feature. If that fetch fails, the
 *  settings above it still render: they are local configuration and have nothing
 *  to do with whether the server could be reached.
 */
import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  Zap,
} from 'lucide-react';
import { CronExpressionParser } from 'cron-parser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Mono, Select, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { HelpTip } from '@/components/ui/help-tip';
import { JsonBlock } from '@/components/ui/surface';
import { TriggerIcon } from '@/components/step-icon';
import {
  runAction,
  type WebhookEndpointResult,
  type WebhookSecretResult,
} from '@/lib/actions';
import { gqlRequest } from '@/lib/graphql-client';
import { INSERT_WATCHED_RECORD } from '@/lib/gql';
import { relativeTime } from '@/lib/format';
import { TRIGGER_CATALOG } from '@/lib/step-catalog';
import {
  authDescription,
  triggerDisplayName,
  webhookCurl,
  webhookSettings,
  WEBHOOK_METHODS,
  type WebhookAuth,
  type WebhookMethod,
  type WebhookResponse,
} from '@/lib/trigger-config';
import type { DraftTrigger, Json } from '@/lib/types';
import { cn } from '@/lib/utils';

/** The payload the manual Run button sends, editable per workflow. */
export const DEFAULT_MANUAL_PAYLOAD = {
  text: 'The checkout page keeps crashing and I have been charged twice. This is unacceptable.',
  customer: 'acme-industries',
};

export function manualPayloadFor(triggers: DraftTrigger[]): Json {
  const manual = triggers.find((trigger) => trigger.type === 'manual');
  const configured = manual?.config?.sample_payload;
  if (configured && typeof configured === 'object') return configured;
  return DEFAULT_MANUAL_PAYLOAD as unknown as Json;
}

type Message = { tone: 'success' | 'danger'; text: string } | null;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

export function TriggerConfig({
  trigger,
  orgId,
  locked,
  workflowActive,
  onChange,
  onListen,
}: {
  trigger: DraftTrigger;
  orgId: string;
  locked: boolean;
  workflowActive: boolean;
  onChange: (next: DraftTrigger) => void;
  onListen?: (triggerType: string) => void;
}) {
  const spec = TRIGGER_CATALOG[trigger.type];
  const [message, setMessage] = useState<Message>(null);

  // A non-manual trigger only accepts calls when both gates are open: the
  // workflow is Active and the trigger itself is Live.
  const external = trigger.type !== 'manual';
  const live = trigger.is_enabled && workflowActive;
  const label = typeof trigger.config?.label === 'string' ? trigger.config.label : '';

  function setConfig(patch: Record<string, Json>) {
    onChange({ ...trigger, config: { ...trigger.config, ...patch } });
  }

  return (
    <div className="space-y-4">
      <Field
        label="Name"
        hint={
          <HelpTip side="left">
            Shown on the canvas and in the run history. Give each trigger a name and you can tell at
            a glance which one started a run — two unnamed webhooks look identical.
          </HelpTip>
        }
      >
        <Input
          disabled={locked}
          value={label}
          placeholder={spec.label}
          onChange={(event) => setConfig({ label: event.target.value })}
        />
      </Field>

      <Field
        label={external ? 'Live' : 'Enabled'}
        hint={
          external ? (
            <HelpTip side="left">
              Two gates must both be open for an outside call to be accepted: the workflow&apos;s
              <strong> Active </strong> switch in the toolbar, and this trigger&apos;s
              <strong> Live </strong> switch. A call arriving while either is off is refused with
              409 and no run is created.
            </HelpTip>
          ) : undefined
        }
      >
        <div className="space-y-2">
          <label className="flex h-9.5 items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink-2">
            <input
              type="checkbox"
              className="size-3.5 accent-[var(--color-accent)]"
              checked={trigger.is_enabled}
              disabled={locked}
              onChange={(event) => onChange({ ...trigger, is_enabled: event.target.checked })}
            />
            {external ? 'Accept calls from outside' : 'Available to run'}
          </label>

          {external ? (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                live ? 'border-ok/40 bg-ok-soft/40 text-ok' : 'border-line bg-surface-2 text-ink-3',
              )}
            >
              <span
                className={cn('size-2 rounded-full', live ? 'animate-step-pulse bg-ok' : 'bg-ink-3')}
              />
              <span className="font-semibold tracking-wide uppercase">
                {live ? 'Live' : 'Not live'}
              </span>
              <span className="text-ink-3">
                {live
                  ? 'accepting calls now'
                  : !workflowActive
                    ? 'the workflow is not Active'
                    : 'this trigger is switched off'}
              </span>
            </div>
          ) : null}
        </div>
      </Field>

      {trigger.type === 'manual' ? (
        <ManualConfig trigger={trigger} locked={locked} onChange={onChange} />
      ) : null}

      {trigger.type === 'webhook' ? (
        <WebhookConfig
          trigger={trigger}
          locked={locked}
          live={live}
          onChange={onChange}
          onMessage={setMessage}
          onListen={onListen}
        />
      ) : null}

      {trigger.type === 'scheduled' ? (
        <ScheduleConfig trigger={trigger} locked={locked} onChange={onChange} onListen={onListen} />
      ) : null}

      {trigger.type === 'database_event' ? (
        <DatabaseEventConfig
          trigger={trigger}
          orgId={orgId}
          locked={locked}
          onChange={onChange}
          onMessage={setMessage}
          onListen={onListen}
        />
      ) : null}

      {trigger.last_fired_at ? (
        <p className="text-xs text-ink-3">Last fired {relativeTime(trigger.last_fired_at)}</p>
      ) : null}

      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ manual */

function ManualConfig({
  trigger,
  locked,
  onChange,
}: {
  trigger: DraftTrigger;
  locked: boolean;
  onChange: (next: DraftTrigger) => void;
}) {
  const current = trigger.config?.sample_payload ?? (DEFAULT_MANUAL_PAYLOAD as unknown as Json);
  const [text, setText] = useState(() => JSON.stringify(current, null, 2));
  const [invalid, setInvalid] = useState(false);

  return (
    <Field
      label="Run payload"
      hint={
        <HelpTip side="left">
          Pressing Run sends this JSON as <Mono>trigger.payload</Mono>. Steps read it with{' '}
          <Mono>{'{{trigger.payload.text}}'}</Mono>.
        </HelpTip>
      }
      help={invalid ? 'Not valid JSON — fix it before saving.' : undefined}
    >
      <Textarea
        rows={8}
        disabled={locked}
        className="font-mono text-xs"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          try {
            const parsed = JSON.parse(next) as Json;
            setInvalid(false);
            onChange({ ...trigger, config: { ...trigger.config, sample_payload: parsed } });
          } catch {
            setInvalid(true);
          }
        }}
      />
    </Field>
  );
}

/* ----------------------------------------------------------------- webhook */

function WebhookConfig({
  trigger,
  locked,
  live,
  onChange,
  onMessage,
  onListen,
}: {
  trigger: DraftTrigger;
  locked: boolean;
  live: boolean;
  onChange: (next: DraftTrigger) => void;
  onMessage: (message: Message) => void;
  onListen?: (triggerType: string) => void;
}) {
  const settings = webhookSettings(trigger.config);

  // Keyed by trigger id so the result is derived, not synced from an effect:
  // `loading` is simply "we do not have a result for this id yet".
  const [loaded, setLoaded] = useState<{
    id: string;
    endpoint: WebhookEndpointResult | null;
    error: string | null;
  } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [body, setBody] = useState(
    JSON.stringify({ text: 'Your courier lost my parcel', customer: 'acme' }, null, 2),
  );

  const triggerId = trigger.id;

  useEffect(() => {
    if (!triggerId) return;
    let cancelled = false;
    runAction<WebhookEndpointResult>('getWebhookEndpoint', { trigger_id: triggerId })
      .then((result) => {
        if (!cancelled) setLoaded({ id: triggerId, endpoint: result, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoaded({
            id: triggerId,
            endpoint: null,
            error: error instanceof Error ? error.message : 'Could not load the endpoint.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [triggerId]);

  const fresh = loaded?.id === triggerId ? loaded : null;
  const endpoint = fresh?.endpoint ?? null;
  const loadError = fresh?.error ?? null;
  const loading = Boolean(triggerId) && !fresh;
  const secret = rotated ?? endpoint?.secret ?? '';

  function setConfig(patch: Record<string, Json>) {
    onChange({ ...trigger, config: { ...trigger.config, ...patch } });
  }

  /** The URL as the caller must send it, including the query-string secret. */
  function callableUrl(): string {
    if (!endpoint) return '';
    let url = endpoint.rest_endpoint;
    if (settings.method === 'GET') {
      // GET has no body, so the test payload travels as query parameters.
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(parsed)) {
          params.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
        if ([...params.keys()].length) url += `?${params.toString()}`;
      } catch {
        // Unparseable test payload: send the bare URL and let the endpoint answer.
      }
    }
    if (settings.auth === 'query' && secret) {
      url += `${url.includes('?') ? '&' : '?'}secret=${encodeURIComponent(secret)}`;
    }
    return url;
  }

  async function sendTest() {
    if (!endpoint || !secret) return;
    setTesting(true);
    onMessage(null);
    try {
      const headers: Record<string, string> = {};
      if (settings.auth === 'header') headers['x-webhook-secret'] = secret;
      if (settings.auth === 'bearer') headers.authorization = `Bearer ${secret}`;
      if (settings.method !== 'GET') headers['content-type'] = 'application/json';

      const response = await fetch(callableUrl(), {
        method: settings.method,
        headers,
        body: settings.method === 'GET' ? undefined : body,
      });
      const json = (await response.json().catch(() => null)) as {
        workflow_run_id?: string;
        status?: string;
        message?: string;
        output?: unknown;
      } | null;

      if (!response.ok) {
        onMessage({
          tone: 'danger',
          text: json?.message ?? `The webhook returned ${response.status}.`,
        });
        return;
      }

      onMessage({
        tone: 'success',
        text:
          settings.response === 'when_finished'
            ? `Webhook accepted and waited — run ${json?.workflow_run_id?.slice(0, 8) ?? ''} finished as ${json?.status ?? 'unknown'}.`
            : `Webhook accepted — run ${json?.workflow_run_id?.slice(0, 8) ?? ''} started. Watch it on the canvas or in Executions.`,
      });
    } catch (error) {
      onMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Could not reach the webhook endpoint.',
      });
    } finally {
      setTesting(false);
    }
  }

  async function rotate() {
    if (!triggerId) return;
    setRotating(true);
    onMessage(null);
    try {
      const result = await runAction<WebhookSecretResult>('rotateWebhookSecret', {
        trigger_id: triggerId,
      });
      setRotated(result.secret);
      setRevealed(true);
      setConfirmRotate(false);
      onMessage({
        tone: 'success',
        text: 'New secret issued. Every caller using the old one will now get 401 — update them.',
      });
    } catch (error) {
      onMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Could not rotate the secret.',
      });
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- behaviour */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Method"
          hint={
            <HelpTip side="left">
              The one HTTP verb this endpoint accepts. Anything else is refused with 405 and a
              message naming the right verb. Use GET when the caller cannot send a body — its query
              string becomes the payload.
            </HelpTip>
          }
        >
          <Select
            disabled={locked}
            value={settings.method}
            onChange={(event) => setConfig({ method: event.target.value as WebhookMethod })}
          >
            {WEBHOOK_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Secret goes in"
          hint={
            <HelpTip side="left">
              Where this endpoint expects its secret. Pick the query string for callers that cannot
              set headers, and Bearer for anything that speaks OAuth-shaped auth. The value is
              compared in constant time whichever you choose.
            </HelpTip>
          }
        >
          <Select
            disabled={locked}
            value={settings.auth}
            onChange={(event) => setConfig({ auth: event.target.value as WebhookAuth })}
          >
            <option value="header">Header — x-webhook-secret</option>
            <option value="query">Query string — ?secret=</option>
            <option value="bearer">Header — Authorization: Bearer</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Respond"
        hint={
          <HelpTip side="left">
            <strong>Immediately</strong> answers 202 with the run id and executes in the background —
            right for anything that just needs to fire and forget.{' '}
            <strong>When the run finishes</strong> holds the request open and returns the run&apos;s
            status, its final step output and any saved rows, so a script can use the result
            directly. A run still going after 45 seconds answers 202 and carries on.
          </HelpTip>
        }
      >
        <Select
          disabled={locked}
          value={settings.response}
          onChange={(event) => setConfig({ response: event.target.value as WebhookResponse })}
        >
          <option value="immediate">Immediately — 202 with the run id</option>
          <option value="when_finished">When the run finishes — return its output</option>
        </Select>
      </Field>

      <Field
        label="Required fields"
        hint={
          <HelpTip side="left">
            Comma-separated payload keys that must be present and non-empty. A call missing one is
            refused with 400 before any run is created, which is better than a run that quietly does
            nothing because <Mono>{'{{trigger.payload.text}}'}</Mono> was empty.
          </HelpTip>
        }
      >
        <Input
          disabled={locked}
          className="font-mono text-xs"
          value={settings.requireFields.join(', ')}
          placeholder="text, customer"
          onChange={(event) =>
            setConfig({
              require_fields: event.target.value
                .split(',')
                .map((field) => field.trim())
                .filter(Boolean),
            })
          }
        />
      </Field>

      {/* -------------------------------------------------------- endpoint */}
      {!triggerId ? (
        <Alert tone="warning">
          Save the workflow to create this webhook. Its secret is generated by the database at that
          point — the client never chooses it.
        </Alert>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="size-4 animate-spin" />
          Loading the endpoint…
        </div>
      ) : loadError || !endpoint ? (
        <Alert tone="warning" title="The endpoint could not be loaded">
          {loadError ?? 'The endpoint is not available.'}
        </Alert>
      ) : (
        <>
          {onListen ? (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => onListen('webhook')}
            >
              <Radio className="size-3.5" />
              Listen for a call
            </Button>
          ) : null}

          {live ? null : (
            <Alert tone="warning">
              This endpoint is not live: calls are refused with 409 until the workflow is Active and
              this trigger is switched on.
            </Alert>
          )}

          <Field
            label={`Endpoint (${settings.method})`}
            hint={
              <HelpTip side="left">
                Anyone with the secret can start a run, with no login — that is what a webhook is
                for, and why only an owner may create one or read the secret. This one expects it in
                the {authDescription(settings.auth)}.
              </HelpTip>
            }
          >
            <div className="flex gap-2">
              <Input readOnly value={endpoint.rest_endpoint} className="font-mono text-[11px]" />
              <CopyButton value={endpoint.rest_endpoint} label="endpoint" />
            </div>
          </Field>

          <Field label="Secret" help={rotated ? 'Newly issued — copy it now.' : undefined}>
            <div className="flex gap-2">
              <Input
                readOnly
                type={revealed ? 'text' : 'password'}
                value={secret}
                className="font-mono text-[11px]"
              />
              <Button
                size="sm"
                aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
                onClick={() => setRevealed((value) => !value)}
              >
                {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
              <CopyButton value={secret} label="secret" />
              {confirmRotate ? (
                <Button size="sm" variant="danger" loading={rotating} onClick={rotate}>
                  <Check className="size-3.5" />
                  Replace
                </Button>
              ) : (
                <Button
                  size="sm"
                  aria-label="Rotate secret"
                  title="Issue a new secret and invalidate the old one"
                  onClick={() => setConfirmRotate(true)}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              )}
            </div>
          </Field>

          {confirmRotate ? (
            <Alert tone="warning">
              Replacing the secret breaks every caller still using the old one. Do it if the current
              secret has leaked.
            </Alert>
          ) : null}

          <Field
            label={settings.method === 'GET' ? 'Test parameters' : 'Test payload'}
            hint={
              <HelpTip side="left">
                Sent as <Mono>trigger.payload</Mono> — the same shape an external system would send.
                {settings.method === 'GET'
                  ? ' For GET these become query parameters.'
                  : ''}
              </HelpTip>
            }
          >
            <Textarea
              rows={4}
              className="font-mono text-xs"
              value={body}
              disabled={locked}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>

          <Button
            variant="primary"
            size="sm"
            loading={testing}
            onClick={sendTest}
            className="w-full"
          >
            <Send className="size-3.5" />
            Send a test request now
          </Button>

          <Field
            label="curl"
            hint={
              <HelpTip side="left">
                Matches this trigger&apos;s settings exactly — paste it into a terminal, Postman or
                another system.
              </HelpTip>
            }
          >
            <JsonBlock
              className="max-h-44"
              text={webhookCurl({
                endpoint: endpoint.rest_endpoint,
                secret: revealed ? secret : '<secret>',
                settings,
                body,
              })}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                void navigator.clipboard?.writeText(
                  webhookCurl({
                    endpoint: endpoint.rest_endpoint,
                    secret,
                    settings,
                    body,
                    multiline: false,
                  }),
                )
              }
            >
              <Copy className="size-3.5" />
              Copy curl
            </Button>
            <Button size="sm" onClick={() => void navigator.clipboard?.writeText(endpoint.sample_curl)}>
              <Copy className="size-3.5" />
              Copy as GraphQL Action
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- scheduled */

function ScheduleConfig({
  trigger,
  locked,
  onChange,
  onListen,
}: {
  trigger: DraftTrigger;
  locked: boolean;
  onChange: (next: DraftTrigger) => void;
  onListen?: (triggerType: string) => void;
}) {
  const expression = trigger.cron_expression ?? '';
  const timezone = typeof trigger.config.timezone === 'string' ? trigger.config.timezone : '';

  let preview: string | null = null;
  let cronError: string | null = null;
  if (expression.trim()) {
    try {
      const interval = CronExpressionParser.parse(expression, {
        currentDate: new Date(),
        ...(timezone ? { tz: timezone } : {}),
      });
      const upcoming = [interval.next().toDate(), interval.next().toDate()];
      preview = upcoming.map((date) => date.toLocaleString()).join(' · then ');
    } catch (error) {
      cronError = error instanceof Error ? error.message : 'That is not a valid cron expression.';
    }
  }

  return (
    <div className="space-y-4">
      {onListen ? (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => onListen('scheduled')}
        >
          <Radio className="size-3.5" />
          Wait for the next fire
        </Button>
      ) : null}

      <Field
        label="Cron expression"
        hint={
          <HelpTip side="left">
            Five fields: minute, hour, day-of-month, month, day-of-week. A Hasura Cron Trigger ticks
            once a minute and starts any schedule that is due.
          </HelpTip>
        }
      >
        <Input
          className="font-mono text-xs"
          disabled={locked}
          value={expression}
          placeholder="*/5 * * * *"
          onChange={(event) => onChange({ ...trigger, cron_expression: event.target.value })}
        />
      </Field>

      <div className="flex flex-wrap gap-1.5">
        {[
          { label: 'every 5 min', value: '*/5 * * * *' },
          { label: 'hourly', value: '0 * * * *' },
          { label: 'daily 9am', value: '0 9 * * *' },
          { label: 'weekdays 9am', value: '0 9 * * 1-5' },
        ].map((preset) => (
          <button
            key={preset.value}
            type="button"
            disabled={locked}
            onClick={() => onChange({ ...trigger, cron_expression: preset.value })}
            className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {cronError ? <Alert tone="danger">{cronError}</Alert> : null}
      {preview ? (
        <p className="text-xs text-ink-3">
          Next runs: <span className="text-ink-2">{preview}</span>
        </p>
      ) : null}

      <Field
        label="Timezone"
        hint={<HelpTip side="left">Optional IANA name, e.g. Asia/Kolkata. Defaults to UTC.</HelpTip>}
      >
        <Input
          disabled={locked}
          value={timezone}
          placeholder="UTC"
          onChange={(event) =>
            onChange({ ...trigger, config: { ...trigger.config, timezone: event.target.value } })
          }
        />
      </Field>

      <p className="flex items-center gap-1.5 text-xs text-ink-3">
        Needs a public URL to fire
        <HelpTip>
          Hasura calls the scheduler over the internet, so a schedule only fires once the app is
          deployed and <Mono>APP_BASE_URL</Mono> points at it.
        </HelpTip>
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- database event */

function DatabaseEventConfig({
  trigger,
  orgId,
  locked,
  onChange,
  onMessage,
  onListen,
}: {
  trigger: DraftTrigger;
  orgId: string;
  locked: boolean;
  onChange: (next: DraftTrigger) => void;
  onMessage: (message: Message) => void;
  onListen?: (triggerType: string) => void;
}) {
  const sourceKey = typeof trigger.config.source_key === 'string' ? trigger.config.source_key : '';
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState(
    JSON.stringify({ text: 'A row landed in the watched table', customer: 'acme' }, null, 2),
  );

  async function insertRow() {
    setBusy(true);
    onMessage(null);
    try {
      const parsed = JSON.parse(payload) as Json;
      await gqlRequest(INSERT_WATCHED_RECORD, {
        object: { org_id: orgId, source_key: sourceKey || 'default', payload: parsed },
      });
      onMessage({
        tone: 'success',
        text: 'Row inserted into watched_records. The Hasura Event Trigger starts a run as soon as it can reach the app.',
      });
    } catch (error) {
      onMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Could not insert the row.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {onListen ? (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => onListen('database_event')}
        >
          <Radio className="size-3.5" />
          Listen for a row
        </Button>
      ) : null}

      <Field
        label="Source key"
        hint={
          <HelpTip side="left">
            A row inserted into <Mono>watched_records</Mono> fires a Hasura Event Trigger, which
            starts every enabled database-event trigger in this org whose source key matches. Blank
            accepts every row. The row&apos;s payload becomes <Mono>trigger.payload</Mono>.
          </HelpTip>
        }
      >
        <Input
          disabled={locked}
          value={sourceKey}
          placeholder="support_ticket"
          onChange={(event) =>
            onChange({ ...trigger, config: { ...trigger.config, source_key: event.target.value } })
          }
        />
      </Field>

      <Field label="Test payload">
        <Textarea
          rows={4}
          className="font-mono text-xs"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
        />
      </Field>

      <Button variant="primary" size="sm" loading={busy} onClick={insertRow} className="w-full">
        <Zap className="size-3.5" />
        Insert a row now
      </Button>

      <Field
        label="How another system would insert it"
        hint={<HelpTip side="left">Run this from any client authorised for your org.</HelpTip>}
      >
        <JsonBlock
          className="max-h-44"
          text={`mutation {
  insert_watched_records_one(object: {
    org_id: "${orgId}"
    source_key: "${sourceKey || 'default'}"
    payload: { text: "…" }
  }) { id }
}`}
        />
      </Field>

      <p className="flex items-center gap-1.5 text-xs text-ink-3">
        Needs a public URL to fire
        <HelpTip>
          Hasura delivers the event over the internet, so a run starts once the app is deployed and{' '}
          <Mono>APP_BASE_URL</Mono> points at it. The row is written either way.
        </HelpTip>
      </p>
    </div>
  );
}

export function TriggerTypeBadge({ trigger }: { trigger: DraftTrigger }) {
  const spec = TRIGGER_CATALOG[trigger.type];
  return (
    <Badge>
      <TriggerIcon type={trigger.type} className="size-3" />
      {triggerDisplayName(trigger, spec.label)}
    </Badge>
  );
}
