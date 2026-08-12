'use client';

/**
 * Trigger configuration.
 *
 * Every trigger type answers the same three questions here: how does it fire,
 * what does it send the workflow, and how do I test it right now. For a webhook
 * that means the callable URL, the secret and a ready-to-paste curl — fetched
 * automatically for owners rather than hidden behind a button, because a webhook
 * you cannot find the URL for is not a feature.
 */
import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Loader2, Radio, Send, Zap } from 'lucide-react';
import { CronExpressionParser } from 'cron-parser';
import { TriggerIcon } from '@/components/step-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Mono, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { HelpTip } from '@/components/ui/help-tip';
import { JsonBlock } from '@/components/ui/surface';
import { runAction, type WebhookEndpointResult } from '@/lib/actions';
import { gqlRequest } from '@/lib/graphql-client';
import { INSERT_WATCHED_RECORD } from '@/lib/gql';
import { relativeTime } from '@/lib/format';
import { TRIGGER_CATALOG } from '@/lib/step-catalog';
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
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  // A non-manual trigger only accepts calls when both gates are open: the
  // workflow is Active and the trigger itself is Live.
  const external = trigger.type !== 'manual';
  const live = trigger.is_enabled && workflowActive;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-3">{spec.blurb}</p>

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
                live
                  ? 'border-ok/40 bg-ok-soft/40 text-ok'
                  : 'border-line bg-surface-2 text-ink-3',
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  live ? 'animate-step-pulse bg-ok' : 'bg-ink-3',
                )}
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
    <div className="space-y-3">
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
    </div>
  );
}

/* ----------------------------------------------------------------- webhook */

function WebhookConfig({
  trigger,
  locked,
  live,
  onMessage,
  onListen,
}: {
  trigger: DraftTrigger;
  locked: boolean;
  live: boolean;
  onMessage: (message: { tone: 'success' | 'danger'; text: string } | null) => void;
  onListen?: (triggerType: string) => void;
}) {
  // Keyed by trigger id so the result is derived, not synced from an effect:
  // `loading` is simply "we do not have a result for this id yet".
  const [loaded, setLoaded] = useState<{
    id: string;
    endpoint: WebhookEndpointResult | null;
    error: string | null;
  } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [body, setBody] = useState(
    JSON.stringify({ text: 'Your courier lost my parcel', customer: 'acme' }, null, 2),
  );

  const triggerId = trigger.id;

  // Fetched as soon as the panel opens: an owner should see the URL and secret
  // without hunting for a button. Non-owners get a clear refusal instead.
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
  const loading = triggerId ? !fresh : false;

  async function sendTest() {
    if (!endpoint) return;
    setTesting(true);
    onMessage(null);
    try {
      const response = await fetch(endpoint.rest_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-secret': endpoint.secret },
        body,
      });
      const json = (await response.json().catch(() => null)) as { workflow_run_id?: string; message?: string } | null;
      onMessage(
        response.ok
          ? {
              tone: 'success',
              text: `Webhook accepted — run ${json?.workflow_run_id?.slice(0, 8) ?? ''} started. Watch it on the canvas or in Executions.`,
            }
          : { tone: 'danger', text: json?.message ?? `The webhook returned ${response.status}.` },
      );
    } catch (error) {
      onMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Could not reach the webhook endpoint.',
      });
    } finally {
      setTesting(false);
    }
  }

  if (!triggerId) {
    return (
      <Alert tone="warning">
        Save the workflow to create this webhook. Its secret is generated by the database at that
        point — the client never chooses it.
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <Loader2 className="size-4 animate-spin" />
        Loading the endpoint…
      </div>
    );
  }

  if (loadError || !endpoint) {
    return <Alert tone="warning">{loadError ?? 'The endpoint is not available.'}</Alert>;
  }

  return (
    <div className="space-y-4">
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
          This endpoint is not live: calls are refused with 409 until the workflow is Active and this
          trigger is switched on.
        </Alert>
      )}

      <Field
        label="Endpoint (POST)"
        hint={
          <HelpTip side="left">
            Anyone with the secret can start a run, with no login — that is what a webhook is for,
            and why only an owner may create one or read the secret. Send it as the{' '}
            <Mono>x-webhook-secret</Mono> header.
          </HelpTip>
        }
      >
        <div className="flex gap-2">
          <Input readOnly value={endpoint.rest_endpoint} className="font-mono text-[11px]" />
          <CopyButton value={endpoint.rest_endpoint} label="endpoint" />
        </div>
      </Field>

      <Field label="Secret">
        <div className="flex gap-2">
          <Input
            readOnly
            type={revealed ? 'text' : 'password'}
            value={endpoint.secret}
            className="font-mono text-[11px]"
          />
          <Button
            size="sm"
            aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
          <CopyButton value={endpoint.secret} label="secret" />
        </div>
      </Field>

      <Field
        label="Test payload"
        hint={
          <HelpTip side="left">
            Sent as <Mono>trigger.payload</Mono> — the same shape an external system would post.
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

      <Button variant="primary" size="sm" loading={testing} onClick={sendTest} className="w-full">
        <Send className="size-3.5" />
        Send a test request now
      </Button>

      <Field
        label="curl"
        hint={<HelpTip side="left">Paste into a terminal, or hand it to another system.</HelpTip>}
      >
        <JsonBlock
          className="max-h-44"
          text={`curl -X POST '${endpoint.rest_endpoint}' \\
  -H 'x-webhook-secret: ${revealed ? endpoint.secret : '<secret>'}' \\
  -H 'content-type: application/json' \\
  -d '${body.replace(/\s+/g, ' ')}'`}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() =>
            void navigator.clipboard?.writeText(
              `curl -X POST '${endpoint.rest_endpoint}' -H 'x-webhook-secret: ${endpoint.secret}' -H 'content-type: application/json' -d '${body.replace(/\s+/g, ' ')}'`,
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
  onMessage: (message: { tone: 'success' | 'danger'; text: string } | null) => void;
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
      {spec.label}
    </Badge>
  );
}
