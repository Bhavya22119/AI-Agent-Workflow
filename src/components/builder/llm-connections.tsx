'use client';

/**
 * Bring-your-own-model, in two pieces.
 *
 *   LlmConnectionField    the Connection + Model controls inside an llm_call node
 *   LlmConnectionsModal   create / edit / test / delete an organization's endpoints
 *
 * Adding an endpoint asks for exactly what a call needs and nothing more: the
 * provider, its base URL, a key and a model. Picking a provider fills the other
 * three in, because "what is Groq's base URL again" is not a question anybody
 * should have to leave the page to answer. "Other" reveals the API-format choice
 * so an endpoint nobody has heard of still works.
 *
 * The key goes in and never comes back — `llm_connections.api_key` has no select
 * permission — so editing an existing connection leaves that field blank and only
 * sends it when it has been re-typed.
 */
import { useState } from 'react';
import { Check, ExternalLink, KeyRound, Plus, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Mono, Select } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { HelpTip } from '@/components/ui/help-tip';
import { Modal } from '@/components/ui/modal';
import { freshAccessToken, gqlRequest } from '@/lib/graphql-client';
import { DELETE_LLM_CONNECTION, INSERT_LLM_CONNECTION, UPDATE_LLM_CONNECTION } from '@/lib/gql';
import {
  DEFAULT_BASE_URL,
  defaultModelFor,
  describeEndpoint,
  isLlmProtocol,
  LLM_PROTOCOLS,
  PROTOCOL_SPECS,
  vendorLabel,
  vendorSpec,
  VENDOR_GROUPS,
  VENDORS,
  type LlmProtocol,
} from '@/lib/llm-providers';
import type { DraftStep, Json, LlmConnection, OrgRole } from '@/lib/types';

/* ------------------------------------------------------------------ picker */

export function LlmConnectionField({
  step,
  connections,
  connectionsError,
  canManage,
  disabled,
  onChange,
  onManage,
}: {
  step: DraftStep;
  connections: LlmConnection[];
  /** Set when the connections query failed, e.g. the migration has not been run. */
  connectionsError?: string | null;
  canManage: boolean;
  disabled: boolean;
  onChange: (next: DraftStep) => void;
  onManage: () => void;
}) {
  const connectionId =
    typeof step.config.connection_id === 'string' ? step.config.connection_id : '';
  const model = typeof step.config.model === 'string' ? step.config.model : '';
  const chosen = connections.find((connection) => connection.id === connectionId) ?? null;

  // A connection that has been deleted since this step was configured. Kept as an
  // option so the node does not silently look like it uses the server default.
  const dangling = connectionId.length > 0 && !chosen;

  function setConfig(patch: Record<string, Json>) {
    onChange({ ...step, config: { ...step.config, ...patch } });
  }

  const resolvedModel = model || chosen?.default_model || '';
  const endpoint = chosen
    ? describeEndpoint(chosen.protocol, chosen.base_url, resolvedModel)
    : null;

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-2/50 p-3">
      <Field
        label="Connection"
        hint={
          <HelpTip side="left">
            Which endpoint answers this node. <strong>Server default</strong> uses the key
            configured on the deployment (<Mono>LLM_PROVIDER</Mono>). Anything else is one of your
            organization&apos;s own endpoints — its own base URL, key and model.
          </HelpTip>
        }
      >
        <div className="flex gap-2">
          <Select
            disabled={disabled}
            value={connectionId}
            onChange={(event) => {
              const nextId = event.target.value;
              const next = connections.find((connection) => connection.id === nextId);
              setConfig({
                connection_id: nextId,
                // Adopt the connection's model, unless one was typed by hand.
                model:
                  model && model !== chosen?.default_model ? model : (next?.default_model ?? ''),
              });
            }}
          >
            <option value="">Server default</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name} · {vendorLabel(connection.provider)}
              </option>
            ))}
            {dangling ? <option value={connectionId}>(deleted connection)</option> : null}
          </Select>
          {canManage ? (
            <Button size="sm" onClick={onManage} aria-label="Manage connections">
              <KeyRound className="size-3.5" />
              Manage
            </Button>
          ) : null}
        </div>
      </Field>

      {connectionsError ? (
        <Alert tone="warning">
          Saved connections are unavailable: {connectionsError}
        </Alert>
      ) : null}

      {dangling ? (
        <Alert tone="danger">
          This node points at a connection that no longer exists. Pick another one, or switch to the
          server default.
        </Alert>
      ) : null}

      <Field
        label="Model"
        hint={
          <HelpTip side="left">
            The model name exactly as the provider spells it. Leave blank to use the
            connection&apos;s default{chosen?.default_model ? ` (${chosen.default_model})` : ''}.
          </HelpTip>
        }
      >
        <Input
          disabled={disabled}
          value={model}
          placeholder={
            chosen?.default_model ||
            (chosen ? defaultModelFor(chosen.protocol) : 'leave blank for the server default')
          }
          onChange={(event) => setConfig({ model: event.target.value })}
        />
      </Field>

      {endpoint ? (
        <p className="truncate font-mono text-[11px] text-ink-3" title={endpoint}>
          → {endpoint}
        </p>
      ) : (
        <p className="text-[11px] text-ink-3">
          → the provider configured on the server
          {canManage ? (
            <>
              {' · '}
              <button
                type="button"
                onClick={onManage}
                className="text-accent-ink underline-offset-2 hover:underline"
              >
                use your own model
              </button>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- modal */

interface DraftConnection {
  id?: string;
  name: string;
  /** Vendor id. */
  provider: string;
  protocol: LlmProtocol;
  base_url: string;
  default_model: string;
  api_key: string;
  /** True once the user has edited the name, so a provider change stops renaming it. */
  nameTouched: boolean;
}

function emptyDraft(): DraftConnection {
  const first = VENDORS[0];
  return {
    name: '',
    provider: first.id,
    protocol: first.protocol,
    base_url: first.baseUrl,
    default_model: first.model,
    api_key: '',
    nameTouched: false,
  };
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; reply: string; model: string; latency: number }
  | { kind: 'error'; message: string };

export function LlmConnectionsModal({
  open,
  onClose,
  orgId,
  role,
  connections,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  role: OrgRole | null;
  connections: LlmConnection[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<DraftConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const isOwner = role === 'owner';

  function patch(changes: Partial<DraftConnection>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }

  /**
   * Choosing a provider fills in everything it implies. Fields the user has
   * already changed by hand are left alone, so switching provider to compare two
   * options does not silently discard a typed model name.
   */
  function chooseVendor(id: string) {
    const vendor = vendorSpec(id);
    if (!vendor) return;
    setDraft((current) => {
      if (!current) return current;
      const previous = vendorSpec(current.provider);
      const baseUntouched = !current.base_url || current.base_url === previous?.baseUrl;
      const modelUntouched = !current.default_model || current.default_model === previous?.model;
      return {
        ...current,
        provider: vendor.id,
        protocol: vendor.protocol,
        base_url: baseUntouched ? vendor.baseUrl : current.base_url,
        default_model: modelUntouched ? vendor.model : current.default_model,
        name: current.nameTouched ? current.name : vendor.pickProtocol ? current.name : vendor.label,
      };
    });
    setTest({ kind: 'idle' });
  }

  function edit(connection: LlmConnection) {
    setDraft({
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      protocol: connection.protocol,
      base_url: connection.base_url ?? '',
      default_model: connection.default_model ?? '',
      api_key: '',
      nameTouched: true,
    });
    setTest({ kind: 'idle' });
    setError(null);
  }

  function close() {
    setDraft(null);
    setError(null);
    setTest({ kind: 'idle' });
    setConfirmDelete(null);
    onClose();
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const name = draft.name.trim();
      if (name.length < 2) throw new Error('Give this connection a name of at least 2 characters.');

      const shared = {
        name,
        provider: draft.provider,
        protocol: draft.protocol,
        base_url: draft.base_url.trim() || null,
        default_model: draft.default_model.trim() || null,
      };

      if (draft.id) {
        // Omit api_key entirely when it was left blank: the stored key stays.
        const set = draft.api_key.trim() ? { ...shared, api_key: draft.api_key.trim() } : shared;
        await gqlRequest(UPDATE_LLM_CONNECTION, { id: draft.id, set });
      } else {
        if (draft.api_key.trim().length < 8) {
          throw new Error('An API key is required to create a connection.');
        }
        await gqlRequest(INSERT_LLM_CONNECTION, {
          object: { org_id: orgId, ...shared, api_key: draft.api_key.trim() },
        });
      }

      setDraft(null);
      setTest({ kind: 'idle' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the connection.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await gqlRequest(DELETE_LLM_CONNECTION, { id });
      setConfirmDelete(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the connection.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sends one very small completion through the endpoint being configured. Goes to
   * the app directly rather than through a Hasura Action, so a key that is still
   * being typed never leaves this origin.
   */
  async function runTest() {
    if (!draft) return;
    setTest({ kind: 'busy' });
    try {
      const token = await freshAccessToken();
      const response = await fetch('/api/llm/test-connection', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          connection_id: draft.id,
          provider: draft.provider,
          protocol: draft.protocol,
          base_url: draft.base_url.trim() || undefined,
          api_key: draft.api_key.trim() || undefined,
          model: draft.default_model.trim() || undefined,
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        ok?: boolean;
        reply?: string;
        model?: string;
        latency_ms?: number;
        message?: string;
      } | null;

      if (!response.ok || !json?.ok) {
        setTest({
          kind: 'error',
          message: json?.message ?? `The test failed (${response.status}).`,
        });
        return;
      }
      setTest({
        kind: 'ok',
        reply: json.reply ?? '',
        model: json.model ?? draft.default_model,
        latency: json.latency_ms ?? 0,
      });
    } catch (err) {
      setTest({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not reach the endpoint.',
      });
    }
  }

  const vendor = draft ? vendorSpec(draft.provider) : undefined;
  const protocolSpec = draft ? PROTOCOL_SPECS[draft.protocol] : null;

  return (
    <Modal
      open={open}
      onClose={close}
      title="LLM connections"
      description="Endpoints this organization's llm_call nodes can use instead of the server default."
      className="max-w-xl"
      footer={
        draft ? (
          <>
            <Button onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={busy}>
              {draft.id ? 'Save changes' : 'Add connection'}
            </Button>
          </>
        ) : (
          <Button onClick={close}>Done</Button>
        )
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}

      {!isOwner ? (
        <Alert tone="warning" className="mb-3">
          Only an owner can add or change a connection. An API key spends money and reaches an
          external endpoint, so it sits behind the same rule as a db_write node.
        </Alert>
      ) : null}

      {draft ? (
        /* ------------------------------------------------------------- form */
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Provider"
              hint={
                <HelpTip side="left">
                  Fills in the API format, base URL and a model that exists — all still editable.
                  Every entry here is a real endpoint; pick <strong>Other</strong> for anything not
                  listed.
                </HelpTip>
              }
            >
              <Select
                value={draft.provider}
                onChange={(event) => chooseVendor(event.target.value)}
              >
                {VENDOR_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {VENDORS.filter((entry) => entry.group === group).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>

            <Field label="Name">
              <Input
                value={draft.name}
                placeholder={vendor?.label ?? 'My endpoint'}
                onChange={(event) => patch({ name: event.target.value, nameTouched: true })}
              />
            </Field>
          </div>

          {/* Only asked when the provider does not imply it: three formats is a
              choice about wire shape, and it is noise for a known vendor. */}
          {vendor?.pickProtocol ? (
            <Field
              label="API format"
              hint={protocolSpec ? <HelpTip side="left">{protocolSpec.detail}</HelpTip> : undefined}
            >
              <Select
                value={draft.protocol}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!isLlmProtocol(value)) return;
                  patch({ protocol: value });
                  setTest({ kind: 'idle' });
                }}
              >
                {LLM_PROTOCOLS.map((protocol) => (
                  <option key={protocol} value={protocol}>
                    {PROTOCOL_SPECS[protocol].label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-ink-3">
              Speaks {protocolSpec?.label}
              {protocolSpec ? <HelpTip>{protocolSpec.detail}</HelpTip> : null}
            </p>
          )}

          <Field
            label="Base URL"
            hint={
              <HelpTip side="left">
                The root of the API, without the path — that is added for you. Leave blank for the
                vendor default. A private or loopback address is refused unless the deployment sets{' '}
                <Mono>ALLOW_PRIVATE_HTTP_TARGETS=true</Mono>, the same guard the HTTP request node
                uses.
              </HelpTip>
            }
          >
            <Input
              className="font-mono text-xs"
              value={draft.base_url}
              placeholder={DEFAULT_BASE_URL[draft.protocol]}
              onChange={(event) => patch({ base_url: event.target.value })}
            />
          </Field>

          {vendor?.privateHost ? (
            <Alert tone="info">
              This is a local endpoint. A deployed app cannot reach your machine, and the SSRF guard
              blocks private addresses unless <Mono>ALLOW_PRIVATE_HTTP_TARGETS=true</Mono> is set —
              so use it when running the app locally, or point the URL at a reachable host.
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={protocolSpec?.keyLabel ?? 'API key'}
              help={draft.id ? 'Leave blank to keep the stored key.' : undefined}
              hint={
                <HelpTip side="left">
                  Stored in a column with no read permission for any role, so it cannot be fetched
                  back — not even by you. Only the engine reads it, with the admin secret.
                </HelpTip>
              }
            >
              <Input
                type="password"
                autoComplete="off"
                className="font-mono text-xs"
                value={draft.api_key}
                placeholder={draft.id ? '••••••••  unchanged' : protocolSpec?.keyPlaceholder}
                onChange={(event) => patch({ api_key: event.target.value })}
              />
            </Field>

            <Field
              label="Default model"
              hint={
                <HelpTip side="left">
                  Used by any node that does not name its own model. Spelled exactly as the provider
                  spells it.
                </HelpTip>
              }
            >
              <Input
                className="font-mono text-xs"
                value={draft.default_model}
                placeholder={defaultModelFor(draft.protocol)}
                onChange={(event) => patch({ default_model: event.target.value })}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2">
            <p className="truncate font-mono text-[11px] text-ink-3">
              POST {describeEndpoint(draft.protocol, draft.base_url, draft.default_model)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              onClick={runTest}
              loading={test.kind === 'busy'}
              disabled={!draft.api_key.trim() && !draft.id}
            >
              <Zap className="size-3.5" />
              Test connection
            </Button>
            {vendor?.keysAt ? (
              <a
                href={`https://${vendor.keysAt}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-accent"
              >
                <ExternalLink className="size-3" />
                {vendor.keysAt}
              </a>
            ) : null}
          </div>

          {test.kind === 'ok' ? (
            <Alert tone="success">
              {test.model} replied “{test.reply || '—'}” in {test.latency} ms.
            </Alert>
          ) : null}
          {test.kind === 'error' ? <Alert tone="danger">{test.message}</Alert> : null}
        </div>
      ) : (
        /* ------------------------------------------------------------- list */
        <div className="space-y-2">
          {connections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-ink-3">
              No connections yet. Every <Mono>llm_call</Mono> node uses the server&apos;s provider
              until you add one.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {connections.map((connection) => (
                <li key={connection.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink">
                    <KeyRound className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {connection.name}
                      <span className="ml-1.5 text-xs font-normal text-ink-3">
                        {vendorLabel(connection.provider)}
                      </span>
                    </p>
                    <p
                      className="truncate font-mono text-[11px] text-ink-3"
                      title={describeEndpoint(connection.protocol, connection.base_url)}
                    >
                      {connection.default_model ?? defaultModelFor(connection.protocol)} ·{' '}
                      {describeEndpoint(connection.protocol, connection.base_url)}
                    </p>
                  </div>
                  {isOwner ? (
                    <>
                      <Button size="sm" onClick={() => edit(connection)}>
                        Edit
                      </Button>
                      {confirmDelete === connection.id ? (
                        <Button
                          size="sm"
                          variant="danger"
                          loading={busy}
                          onClick={() => remove(connection.id)}
                        >
                          <Check className="size-3.5" />
                          Confirm
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          aria-label={`Delete ${connection.name}`}
                          onClick={() => setConfirmDelete(connection.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {isOwner ? (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={() => {
                setDraft(emptyDraft());
                setTest({ kind: 'idle' });
              }}
            >
              <Plus className="size-3.5" />
              Add a connection
            </Button>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
