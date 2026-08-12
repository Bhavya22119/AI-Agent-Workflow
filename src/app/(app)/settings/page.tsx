'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useOrg } from '@/components/providers/org-provider';
import { QuotaMeter } from '@/components/quota-meter';
import { LlmConnectionsModal } from '@/components/builder/llm-connections';
import { RoleBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Mono } from '@/components/ui/field';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Card, CardHeader, PageHeader, Stat } from '@/components/ui/surface';
import { useQuery } from '@/hooks/use-query';
import { millis } from '@/lib/format';
import { LLM_CONNECTIONS, ORG_USAGE, RENAME_ORG } from '@/lib/gql';
import { describeEndpoint, vendorLabel } from '@/lib/llm-providers';
import { gqlRequest } from '@/lib/graphql-client';
import { actionTransport } from '@/lib/actions';
import { canManageMembers } from '@/lib/step-catalog';
import type { LlmConnection, UsageSummary } from '@/lib/types';

export default function SettingsPage() {
  const { activeOrgId, activeMembership, role, refresh } = useOrg();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const [connectionsOpen, setConnectionsOpen] = useState(false);

  const { data, loading, refetch } = useQuery<{ org_usage_summary: UsageSummary[] }>(
    ORG_USAGE,
    { orgId: activeOrgId },
    { skip: !activeOrgId },
  );
  const usage = data?.org_usage_summary?.[0] ?? null;

  const { data: connectionData, refetch: refetchConnections } = useQuery<{
    llm_connections: LlmConnection[];
  }>(LLM_CONNECTIONS, { orgId: activeOrgId }, { skip: !activeOrgId });
  const connections = connectionData?.llm_connections ?? [];

  // The field is keyed by org rather than synced from an effect, so switching
  // organization shows the new name without a render that shows the old one.
  const savedName = activeMembership?.organization.name ?? '';
  const [edited, setEdited] = useState<{ orgId: string; value: string } | null>(null);
  const name = edited && edited.orgId === activeOrgId ? edited.value : savedName;
  const setName = (value: string) => {
    if (activeOrgId) setEdited({ orgId: activeOrgId, value });
  };

  async function onRename(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrgId) return;
    setBusy(true);
    setFeedback(null);
    try {
      await gqlRequest(RENAME_ORG, { id: activeOrgId, name: name.trim() });
      setEdited(null);
      await refresh();
      await refetch();
      setFeedback({ tone: 'success', text: 'Organization renamed.' });
    } catch (err) {
      setFeedback({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Could not rename the organization.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization"
        title="Settings"
        description="Organization details, usage, your LLM endpoints, and the identifiers you need for the cross-tenant checks."
      />

      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

      <Card className="p-4">
        <form onSubmit={onRename} className="flex flex-wrap items-end gap-3">
          <Field label="Organization name" className="min-w-56 flex-1">
            <Input
              value={name}
              disabled={!canManageMembers(role)}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {canManageMembers(role) ? (
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={name.trim() === activeMembership?.organization.name}
            >
              Rename
            </Button>
          ) : null}
        </form>
        <p className="mt-2 text-xs text-ink-3">
          Only an owner can rename an organization. The run quota is deliberately not editable from
          the app — a tenant that can raise its own limit does not have a limit. Change{' '}
          <Mono>organizations.quota_limit</Mono> with the admin secret (or{' '}
          <Mono>npm run seed</Mono>) to adjust it.
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuotaMeter usage={usage} />
        <Stat label="Runs this period" value={usage?.runs_this_period ?? 0} />
        <Stat
          label="Avg run duration"
          value={millis(usage?.avg_run_duration_ms ?? 0)}
          sub="org_usage_summary view"
        />
        <Stat
          label="In flight"
          value={usage?.runs_active ?? 0}
          sub="counted against the quota when starting a run"
        />
      </div>

      <Card>
        <CardHeader
          title="LLM connections"
          description="Endpoints your llm_call nodes can use instead of the deployment's own provider."
          actions={
            <Button size="sm" onClick={() => setConnectionsOpen(true)}>
              <KeyRound className="size-3.5" />
              {canManageMembers(role) ? 'Manage' : 'View'}
            </Button>
          }
        />
        {connections.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-3">
            None yet — every <Mono>llm_call</Mono> node uses the provider configured on the server.
            {canManageMembers(role)
              ? ' Add one to point a node at your own model.'
              : ' Only an owner can add one.'}
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {connections.map((connection) => (
              <li key={connection.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="w-40 shrink-0 truncate font-medium text-ink">
                  {connection.name}
                </span>
                <span className="shrink-0 text-xs text-ink-3">
                  {vendorLabel(connection.provider)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-3">
                  {connection.default_model ?? 'default model'} ·{' '}
                  {describeEndpoint(connection.protocol, connection.base_url)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-ink-3">
          An API key is stored in a column with no read permission for any role, so it can never be
          fetched back through the API — not even by the owner who set it. Only the engine reads it,
          with the admin secret.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Identifiers"
          description="Useful when proving that another organization cannot reach this one's data."
        />
        <dl className="divide-y divide-line text-sm">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-ink-3">Organization id</dt>
            <dd className="font-mono text-xs break-all text-ink-2">{activeOrgId}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-ink-3">Slug</dt>
            <dd className="font-mono text-xs text-ink-2">
              {activeMembership?.organization.slug}
            </dd>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-ink-3">Your role</dt>
            <dd>{role ? <RoleBadge role={role} /> : '—'}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-ink-3">Action transport</dt>
            <dd className="text-ink-2">
              <Mono>{actionTransport}</Mono>
              <span className="ml-2 text-xs text-ink-3">
                {actionTransport === 'hasura'
                  ? 'mutations go through Hasura, which calls the handler'
                  : 'local development: the browser calls the handler route with its JWT'}
              </span>
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title="How access is enforced here" />
        <ul className="space-y-2 px-4 py-3 text-sm text-ink-2">
          <li>
            <span className="font-medium text-ink">Layer 1 — org + role.</span> Every table
            permission resolves your role through <Mono>org_members</Mono> against{' '}
            <Mono>X-Hasura-User-Id</Mono> from your signed token. Another organization&apos;s rows
            are not in your result set, so a guessed id returns null rather than data.
          </li>
          <li>
            <span className="font-medium text-ink">Layer 2 — step-level.</span> Only an owner can
            create a <Mono>db_write</Mono> or <Mono>notify</Mono> step, or a webhook trigger — as a
            Hasura permission check on insert <em>and</em> update, so an editor cannot create an
            allowed step and then change its type.
          </li>
          <li>
            <span className="font-medium text-ink">Approvals.</span>{' '}
            <Mono>workflow_runs</Mono> and <Mono>step_runs</Mono> grant no write permission to any
            role. Clearing a gate happens only through the <Mono>approveStep</Mono> Action, which
            re-checks your role in that run&apos;s organization before it records anything.
          </li>
        </ul>
      </Card>

      <LlmConnectionsModal
        open={connectionsOpen}
        onClose={() => setConnectionsOpen(false)}
        orgId={activeOrgId ?? ''}
        role={role}
        connections={connections}
        onChanged={() => void refetchConnections()}
      />
    </div>
  );
}
