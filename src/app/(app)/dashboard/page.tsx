'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, Play, Plus, Timer, Workflow as WorkflowIcon } from 'lucide-react';
import { useOrg } from '@/components/providers/org-provider';
import { QuotaMeter } from '@/components/quota-meter';
import { StepIcon, TriggerIcon } from '@/components/step-icon';
import { Badge, RunStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { Card, CardHeader, EmptyState, Stat } from '@/components/ui/surface';
import { useQuery } from '@/hooks/use-query';
import { useSubscription } from '@/hooks/use-subscription';
import { runAction, type TriggerRunResult } from '@/lib/actions';
import { millis, relativeTime } from '@/lib/format';
import { CREATE_WORKFLOW, ORG_RUNS_SUBSCRIPTION, ORG_WORKFLOWS } from '@/lib/gql';
import { gqlRequest } from '@/lib/graphql-client';
import { canEdit, canRun, STEP_CATALOG, TRIGGER_CATALOG } from '@/lib/step-catalog';
import type { RunStatus, TriggerType, UsageSummary, Workflow } from '@/lib/types';

interface OrgWorkflowsData {
  workflows: Workflow[];
  org_usage_summary: UsageSummary[];
}

interface OrgRunsData {
  workflow_runs: Array<{
    id: string;
    status: RunStatus;
    trigger_type: TriggerType;
    started_at: string;
    finished_at: string | null;
    error: string | null;
    workflow: { id: string; name: string };
  }>;
}

export default function DashboardPage() {
  const { activeOrgId, activeMembership, role } = useOrg();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<OrgWorkflowsData>(
    ORG_WORKFLOWS,
    { orgId: activeOrgId },
    { skip: !activeOrgId },
  );

  // Live so runs started by a webhook, a schedule or a database event show up
  // without a refresh, not only the ones started in this browser tab.
  const { data: liveRuns } = useSubscription<OrgRunsData>(
    ORG_RUNS_SUBSCRIPTION,
    { orgId: activeOrgId, limit: 8 },
    { skip: !activeOrgId },
  );

  const usage = data?.org_usage_summary?.[0] ?? null;
  const workflows = useMemo(() => data?.workflows ?? [], [data]);
  const runs = liveRuns?.workflow_runs ?? [];

  async function onCreateWorkflow(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrgId) return;
    setBusy('create');
    setError(null);
    try {
      const result = await gqlRequest<{ insert_workflows_one: { id: string } }>(CREATE_WORKFLOW, {
        object: {
          org_id: activeOrgId,
          name: newName.trim(),
          description: newDescription.trim() || null,
          // Ship it with a manual trigger so the new canvas is runnable as soon
          // as the first node is added.
          workflow_triggers: {
            data: [{ type: 'manual', config: { ui: { x: -320, y: -10 } } }],
          },
        },
      });
      setCreating(false);
      setNewName('');
      setNewDescription('');
      router.push(`/workflows/${result.insert_workflows_one.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the workflow.');
    } finally {
      setBusy(null);
    }
  }

  async function onRun(workflowId: string) {
    setBusy(workflowId);
    setError(null);
    try {
      const result = await runAction<TriggerRunResult>('triggerWorkflowRun', {
        workflow_id: workflowId,
        payload: {
          text: 'The checkout page keeps crashing and I have been charged twice. This is unacceptable.',
          source: 'manual run from the dashboard',
        },
      });
      router.push(`/runs/${result.workflow_run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the run.');
      void refetch();
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <PageLoader label="Loading workflows…" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {activeMembership?.organization.name}
          </h1>
          <p className="mt-0.5 text-sm text-ink-3">
            You are {role === 'owner' ? 'an' : 'a'} <span className="font-medium">{role}</span> here
            {role === 'viewer' ? ' — read-only, and you cannot trigger runs.' : '.'}
          </p>
        </div>
        {canEdit(role) ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New workflow
          </Button>
        ) : null}
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuotaMeter usage={usage} />
        <Stat label="Workflows" value={usage?.workflow_count ?? workflows.length} />
        <Stat
          label="Avg run duration"
          value={millis(usage?.avg_run_duration_ms ?? 0)}
          sub="from the org_usage_summary view"
        />
        <Stat
          label="Completed / failed"
          value={`${usage?.runs_completed ?? 0} / ${usage?.runs_failed ?? 0}`}
          sub={`${usage?.runs_total ?? 0} runs all time`}
        />
      </div>

      <section className="space-y-3">
        {workflows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<WorkflowIcon className="size-6" />}
              title="No workflows yet"
              description={
                canEdit(role)
                  ? 'Create one, add a few steps, and attach a trigger.'
                  : 'An owner or editor needs to create one.'
              }
              action={
                canEdit(role) ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus className="size-4" />
                    New workflow
                  </Button>
                ) : null
              }
            />
          </Card>
        ) : (
          workflows.map((workflow) => {
            const latest = workflow.workflow_runs[0];
            return (
              <Card key={workflow.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/workflows/${workflow.id}`}
                        className="truncate text-sm font-semibold text-ink hover:text-accent"
                      >
                        {workflow.name}
                      </Link>
                      {!workflow.is_active ? <Badge>paused</Badge> : null}
                      {latest ? <RunStatusBadge status={latest.status} /> : null}
                    </div>
                    {workflow.description ? (
                      <p className="mt-1 max-w-2xl text-sm text-ink-3">{workflow.description}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {canRun(role) ? (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={busy === workflow.id}
                        disabled={
                          workflow.workflow_steps.length === 0 ||
                          (usage ? usage.quota_remaining <= 0 : false)
                        }
                        onClick={() => onRun(workflow.id)}
                        title={
                          workflow.workflow_steps.length === 0
                            ? 'Add at least one step first'
                            : usage && usage.quota_remaining <= 0
                              ? 'Quota exhausted'
                              : 'Run this workflow now'
                        }
                      >
                        <Play className="size-3.5" />
                        Run
                      </Button>
                    ) : (
                      <Badge tone="bg-surface-2 text-ink-3">
                        <Eye className="size-3" />
                        view only
                      </Badge>
                    )}
                    <Link
                      href={`/workflows/${workflow.id}`}
                      target="_blank"
                      rel="noopener"
                      title="Opens the full-screen editor in a new tab"
                    >
                      <Button size="sm">
                        Open editor
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {workflow.workflow_steps.map((step) => (
                    <Badge key={step.id} tone={STEP_CATALOG[step.type].tone}>
                      <StepIcon type={step.type} className="size-3" />
                      {step.position}. {step.name || STEP_CATALOG[step.type].label}
                    </Badge>
                  ))}
                  {workflow.workflow_steps.length === 0 ? (
                    <span className="text-xs text-ink-3">No steps yet</span>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-2 text-xs text-ink-3">
                  <span className="flex items-center gap-1.5">
                    Triggers:
                    {workflow.workflow_triggers.length === 0 ? ' none' : null}
                  </span>
                  {workflow.workflow_triggers.map((trigger) => (
                    <span
                      key={trigger.id}
                      className={trigger.is_enabled ? 'flex items-center gap-1' : 'flex items-center gap-1 opacity-50'}
                    >
                      <TriggerIcon type={trigger.type} className="size-3" />
                      {TRIGGER_CATALOG[trigger.type].label}
                      {trigger.type === 'scheduled' && trigger.cron_expression
                        ? ` (${trigger.cron_expression})`
                        : ''}
                    </span>
                  ))}
                  {latest ? (
                    <span className="ml-auto flex items-center gap-1">
                      <Timer className="size-3" />
                      last run {relativeTime(latest.started_at)}
                      <Link href={`/runs/${latest.id}`} className="ml-1 text-accent hover:underline">
                        view
                      </Link>
                    </span>
                  ) : null}
                </div>
              </Card>
            );
          })
        )}
      </section>

      <Card>
        <CardHeader
          title="Live activity"
          description="Streamed over a GraphQL subscription — includes runs started by webhooks, schedules and database events."
          actions={
            <Link href="/runs" className="text-xs font-medium text-accent hover:underline">
              All runs
            </Link>
          }
        />
        {runs.length === 0 ? (
          <EmptyState title="No runs yet" description="Press Run on a workflow to see it here." />
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center gap-3 px-4 py-2.5">
                <RunStatusBadge status={run.status} />
                <Link
                  href={`/runs/${run.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-ink hover:text-accent"
                >
                  {run.workflow?.name ?? 'Workflow'}
                </Link>
                <Badge>
                  <TriggerIcon type={run.trigger_type} className="size-3" />
                  {run.trigger_type}
                </Badge>
                <span className="hidden shrink-0 text-xs text-ink-3 sm:block">
                  {relativeTime(run.started_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New workflow"
        description="You can add steps and triggers next."
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              form="new-workflow"
              type="submit"
              loading={busy === 'create'}
              disabled={newName.trim().length === 0}
            >
              Create
            </Button>
          </>
        }
      >
        <form id="new-workflow" onSubmit={onCreateWorkflow} className="space-y-4">
          <Field label="Name" htmlFor="wf-name">
            <Input
              id="wf-name"
              required
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Support ticket triage"
            />
          </Field>
          <Field label="Description" htmlFor="wf-description">
            <Textarea
              id="wf-description"
              rows={3}
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="Classify an inbound message, call our API, and ask a human before we act."
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
