'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, AlertTriangle, ArrowLeft, Eye, History, Play, Radio, Save, Trash2 } from 'lucide-react';
import { useOrg } from '@/components/providers/org-provider';
import { WorkflowCanvas } from '@/components/canvas/workflow-canvas';
import {
  statusesFromRun,
  toDraftSteps,
  toDraftTriggers,
  topologicalOrder,
} from '@/components/canvas/graph-model';
import { ExecutionBar } from '@/components/canvas/execution-bar';
import { manualPayloadFor } from '@/components/canvas/trigger-inspector';
import { RunStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { useQuery } from '@/hooks/use-query';
import { useSubscription } from '@/hooks/use-subscription';
import { runAction, type TriggerRunResult } from '@/lib/actions';
import { duration, relativeTime } from '@/lib/format';
import {
  DELETE_WORKFLOW,
  RUN_STATUS_SUBSCRIPTION,
  SAVE_WORKFLOW_GRAPH,
  STEP_RUNS_SUBSCRIPTION,
  UPDATE_TRIGGER,
  WORKFLOW_DETAIL,
  WORKFLOW_RUNS_SUBSCRIPTION,
} from '@/lib/gql';
import { gqlRequest } from '@/lib/graphql-client';
import { canEdit, canManageMembers, canRun } from '@/lib/step-catalog';
import { GRAPH_KEY, hasManualTrigger, validateGraph } from '@/lib/validation';
import { cn } from '@/lib/utils';
import type {
  DraftStep,
  DraftTrigger,
  OrgRole,
  RunStatus,
  StepRun,
  Workflow,
  WorkflowRunSummary,
} from '@/lib/types';

type Feedback = { tone: 'success' | 'danger'; text: string } | null;

export default function WorkflowBuilderPage() {
  const params = useParams<{ id: string }>();
  const workflowId = params.id;
  const { activeOrgId, role, selectOrg } = useOrg();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const { data, loading, error, refetch } = useQuery<{ workflows_by_pk: Workflow | null }>(
    WORKFLOW_DETAIL,
    { id: workflowId },
    { skip: !workflowId },
  );
  const workflow = data?.workflows_by_pk ?? null;

  useEffect(() => {
    if (workflow && activeOrgId && workflow.org_id !== activeOrgId) selectOrg(workflow.org_id);
  }, [workflow, activeOrgId, selectOrg]);

  if (loading && !data) return <PageLoader label="Loading workflow…" />;

  // A workflow in another organization is simply not in the result set: Hasura
  // filtered it out. Pasting somebody else's workflow id lands here.
  if (error || !workflow) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Back to workflows
        </Link>
        <Alert tone="warning" title="Workflow not found">
          {error ??
            'This workflow does not exist, or it belongs to an organization you are not a member of. Hasura returns no row either way, so an id from another tenant is indistinguishable from one that was deleted.'}
        </Alert>
      </div>
    );
  }

  return (
    <WorkflowEditor
      // Remounting on updated_at re-seeds the draft from the server after a save,
      // so editor state is initialised from props and never synced by an effect.
      key={`${workflow.id}:${workflow.updated_at}`}
      workflow={workflow}
      role={role}
      feedback={feedback}
      onFeedback={setFeedback}
      onSaved={refetch}
    />
  );
}

function WorkflowEditor({
  workflow,
  role,
  feedback,
  onFeedback,
  onSaved,
}: {
  workflow: Workflow;
  role: OrgRole | null;
  feedback: Feedback;
  onFeedback: (feedback: Feedback) => void;
  onSaved: () => Promise<void>;
}) {
  const router = useRouter();
  const readOnly = !canEdit(role);

  const [name, setName] = useState(workflow.name);
  const [isActive, setIsActive] = useState(workflow.is_active);
  const [steps, setSteps] = useState<DraftStep[]>(() => toDraftSteps(workflow));
  const [triggers, setTriggers] = useState<DraftTrigger[]>(() => toDraftTriggers(workflow));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** The run being watched on the canvas. Pressing Run sets it; it is not a navigation. */
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  /**
   * "Waiting for an external system to call this trigger", the way n8n listens
   * for a test event. Nothing is executed locally — we simply watch for a run
   * that arrives with the matching trigger type.
   */
  const [listening, setListening] = useState<{ type: string; since: string } | null>(null);

  // Executions for this workflow, live, so a webhook or schedule firing shows up
  // here without a refresh.
  const { data: runsData } = useSubscription<{ workflow_runs: WorkflowRunSummary[] }>(
    WORKFLOW_RUNS_SUBSCRIPTION,
    { workflowId: workflow.id, limit: 20 },
  );
  const executions = runsData?.workflow_runs ?? [];

  // A run that arrived while we were listening ends the wait — derived rather
  // than stored, so no effect is needed to notice it.
  const detectedRun = listening
    ? executions.find(
        (run) => run.trigger_type === listening.type && run.started_at > listening.since,
      )
    : undefined;
  const watchedRunId = pickedRunId ?? detectedRun?.id ?? null;

  // The watched run's steps drive the node statuses on the canvas.
  const { data: liveSteps, connecting } = useSubscription<{ step_runs: StepRun[] }>(
    STEP_RUNS_SUBSCRIPTION,
    { runId: watchedRunId },
    { skip: !watchedRunId },
  );
  const { data: liveRun } = useSubscription<{
    workflow_runs_by_pk: {
      id: string;
      status: RunStatus;
      error: string | null;
      started_at: string;
      finished_at: string | null;
    } | null;
  }>(RUN_STATUS_SUBSCRIPTION, { runId: watchedRunId }, { skip: !watchedRunId });

  const watchedSteps = useMemo(() => liveSteps?.step_runs ?? [], [liveSteps]);
  const watchedStatus = liveRun?.workflow_runs_by_pk;
  const statusByKey = useMemo(
    () => (watchedRunId ? statusesFromRun(watchedSteps, steps) : undefined),
    [watchedRunId, watchedSteps, steps],
  );

  const validation = useMemo(() => validateGraph(steps, triggers), [steps, triggers]);
  const graphIssues = validation.byKey.get(GRAPH_KEY) ?? [];
  const canManuallyRun = hasManualTrigger(triggers);
  const blockingIssues = validation.errors;

  const runDisabledReason = dirty
    ? 'Save your changes before running'
    : steps.length === 0
      ? 'Add at least one node'
      : !canManuallyRun
        ? 'This workflow has no enabled manual trigger. Add one, or start it from its own trigger.'
        : blockingIssues.length
          ? `${blockingIssues.length} node${blockingIssues.length === 1 ? '' : 's'} still need configuring`
          : null;

  const originalTriggerIds = useMemo(
    () => new Set(workflow.workflow_triggers.map((trigger) => trigger.id)),
    [workflow],
  );

  /** Applies an updater to draft state and marks the workflow unsaved. */
  function updateSteps(update: (current: DraftStep[]) => DraftStep[]) {
    setSteps(update);
    setDirty(true);
    onFeedback(null);
  }

  function updateTriggers(update: (current: DraftTrigger[]) => DraftTrigger[]) {
    setTriggers(update);
    setDirty(true);
    onFeedback(null);
  }

  async function onSave() {
    setSaving(true);
    onFeedback(null);
    try {
      // `position` is derived from a walk of the graph, so it stays a meaningful
      // execution order for the run timeline even though routing comes from the
      // edges the canvas draws.
      const ordered = topologicalOrder(steps);
      const stepObjects = ordered.map((step, index) => ({
        workflow_id: workflow.id,
        position: index + 1,
        key: step.key,
        type: step.type,
        name: step.name,
        config: step.config,
        next: step.next,
        canvas_x: step.canvas_x,
        canvas_y: step.canvas_y,
        retry_limit: step.retry_limit,
        timeout_ms: step.timeout_ms,
      }));

      // Existing triggers are kept by id rather than deleted and re-inserted, so
      // a webhook's secret survives a save.
      const keepTriggerIds = triggers
        .map((trigger) => trigger.id)
        .filter((id): id is string => typeof id === 'string' && originalTriggerIds.has(id));

      const newTriggers = triggers
        .filter((trigger) => !trigger.id)
        .map((trigger) => ({
          workflow_id: workflow.id,
          type: trigger.type,
          config: trigger.config,
          cron_expression: trigger.cron_expression || null,
          is_enabled: trigger.is_enabled,
        }));

      await gqlRequest(SAVE_WORKFLOW_GRAPH, {
        workflowId: workflow.id,
        name: name.trim(),
        description: workflow.description,
        isActive,
        steps: stepObjects,
        triggers: newTriggers,
        keepTriggerIds,
      });

      await Promise.all(
        triggers
          .filter((trigger) => trigger.id && originalTriggerIds.has(trigger.id))
          .map((trigger) =>
            gqlRequest(UPDATE_TRIGGER, {
              id: trigger.id,
              set: {
                config: trigger.config,
                cron_expression: trigger.cron_expression || null,
                is_enabled: trigger.is_enabled,
              },
            }),
          ),
      );

      setDirty(false);
      onFeedback({ tone: 'success', text: 'Saved.' });
      await onSaved();
    } catch (err) {
      onFeedback({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Could not save the workflow.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function onRun() {
    setRunning(true);
    onFeedback(null);
    try {
      const result = await runAction<TriggerRunResult>('triggerWorkflowRun', {
        workflow_id: workflow.id,
        // Whatever the manual trigger is configured to send.
        payload: manualPayloadFor(triggers),
      });
      // Stay on the canvas and watch it execute, rather than navigating away.
      setPickedRunId(result.workflow_run_id);
      setListening(null);
      setHistoryOpen(false);
    } catch (err) {
      onFeedback({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Could not start the run.',
      });
    } finally {
      setRunning(false);
    }
  }

  async function onDelete() {
    try {
      await gqlRequest(DELETE_WORKFLOW, { id: workflow.id });
      router.replace('/dashboard');
    } catch (err) {
      setConfirmDelete(false);
      onFeedback({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Could not delete the workflow.',
      });
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/dashboard"
            aria-label="Back to workflows"
            className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <Input
            value={name}
            disabled={readOnly}
            aria-label="Workflow name"
            onChange={(event) => {
              setName(event.target.value);
              setDirty(true);
              onFeedback(null);
            }}
            className="h-9 w-56 border-transparent bg-transparent px-2 text-base font-semibold hover:border-line focus:border-accent"
          />
          <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-2">
            <input
              type="checkbox"
              className="size-3.5 accent-[var(--color-accent)]"
              checked={isActive}
              disabled={readOnly}
              onChange={(event) => {
                setIsActive(event.target.checked);
                setDirty(true);
                onFeedback(null);
              }}
            />
            Active
          </label>
          <div className="relative">
            <Button
              size="sm"
              variant={historyOpen ? 'secondary' : 'ghost'}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <History className="size-4" />
              Executions
              {executions.length ? (
                <span className="rounded-full bg-surface-2 px-1.5 text-[10px] tabular-nums text-ink-2">
                  {executions.length}
                </span>
              ) : null}
            </Button>

            {historyOpen ? (
              <div className="animate-fade-rise absolute top-full left-0 z-40 mt-1 max-h-96 w-80 overflow-y-auto rounded-card border border-line bg-surface shadow-2xl">
                <p className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                  Execution history
                </p>
                {executions.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-ink-3">
                    No runs yet. Press Run, or fire the webhook.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {executions.map((run) => (
                      <li key={run.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPickedRunId(run.id);
                            setListening(null);
                            setHistoryOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-2',
                            run.id === watchedRunId && 'bg-accent-soft/50',
                          )}
                        >
                          <RunStatusBadge status={run.status} />
                          <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
                            {run.trigger_type} · {duration(run.started_at, run.finished_at)}
                          </span>
                          <span className="shrink-0 text-[11px] text-ink-3">
                            {relativeTime(run.started_at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {readOnly ? (
            <span className="flex items-center gap-1.5 text-xs text-ink-3">
              <Eye className="size-3.5" />
              Viewers cannot edit or run
            </span>
          ) : (
            <Button variant="secondary" onClick={onSave} loading={saving} disabled={!dirty}>
              <Save className="size-4" />
              {dirty ? 'Save changes' : 'Saved'}
            </Button>
          )}
          {canRun(role) ? (
            <Button
              variant="primary"
              onClick={onRun}
              loading={running}
              disabled={Boolean(runDisabledReason)}
              title={runDisabledReason ?? 'Run this workflow with the manual trigger payload'}
            >
              <Play className="size-4" />
              Run
            </Button>
          ) : null}
        </div>
      </header>

      {feedback ? (
        <div className="shrink-0 px-3 pt-2">
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      ) : null}

      {listening && !watchedRunId ? (
        <div className="animate-fade-rise shrink-0 px-3 pt-2">
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-warn/40 bg-warn-soft/40 px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <Radio className="size-4 animate-step-pulse text-warn" />
              Waiting for a {listening.type.replace('_', ' ')} event…
            </span>
            <span className="text-xs text-ink-3">
              Nothing runs until something calls it. Trigger it from outside — the run appears here
              the moment it arrives.
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setListening(null)}
            >
              Stop listening
            </Button>
          </div>
        </div>
      ) : null}

      {!watchedRunId && !listening && (blockingIssues.length > 0 || graphIssues.length > 0) ? (
        <div className="shrink-0 px-3 pt-2">
          <div
            className={cn(
              'flex flex-wrap items-start gap-2 rounded-card border px-3 py-2 text-sm',
              blockingIssues.length
                ? 'border-danger/40 bg-danger-soft/30 text-danger'
                : 'border-warn/40 bg-warn-soft/30 text-warn',
            )}
          >
            {blockingIssues.length ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="min-w-0 space-y-0.5">
              {[...blockingIssues, ...graphIssues].slice(0, 3).map((issue) => (
                <p key={`${issue.key}-${issue.message}`}>
                  {issue.key === GRAPH_KEY
                    ? issue.message
                    : `${steps.find((step) => step.key === issue.key)?.name || issue.key}: ${issue.message}`}
                </p>
              ))}
              {blockingIssues.length + graphIssues.length > 3 ? (
                <p className="opacity-80">
                  and {blockingIssues.length + graphIssues.length - 3} more — hover the marked nodes.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {watchedRunId ? (
        <div className="shrink-0 px-3 pt-2">
          <ExecutionBar
            runId={watchedRunId}
            status={watchedStatus?.status ?? 'pending'}
            startedAt={watchedStatus?.started_at ?? null}
            finishedAt={watchedStatus?.finished_at ?? null}
            error={watchedStatus?.error ?? null}
            stepRuns={watchedSteps}
            role={role}
            connecting={connecting}
            onClose={() => {
              setPickedRunId(null);
              setListening(null);
            }}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 p-3">
        <WorkflowCanvas
          orgId={workflow.org_id}
          role={role}
          // Editing is disabled while a run is on screen: the node statuses are
          // matched to the saved graph, so letting it change underneath would
          // make the overlay lie.
          readOnly={readOnly || Boolean(watchedRunId)}
          steps={steps}
          triggers={triggers}
          onStepsChange={updateSteps}
          onTriggersChange={updateTriggers}
          statusByKey={statusByKey}
          issuesByKey={validation.byKey}
          workflowActive={isActive}
          onListen={(type) =>
            setListening({ type, since: new Date(Date.now() - 2000).toISOString() })
          }
          className="relative h-full w-full overflow-hidden rounded-card border border-line bg-canvas"
          toolbar={
            <div className="max-w-sm rounded-lg border border-line bg-surface/90 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-3 backdrop-blur">
              {watchedRunId
                ? 'Watching a run — close the bar above to go back to editing.'
                : 'Drag a node’s right dot onto another to connect · click a node to configure it · scroll to zoom'}
              {canManageMembers(role) ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1 text-danger hover:underline"
                  >
                    <Trash2 className="size-3" />
                    delete
                  </button>
                </>
              ) : null}
            </div>
          }
        />
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this workflow?"
        description="Its nodes, triggers and run history go with it. This cannot be undone."
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">{workflow.name}</span> has{' '}
          {workflow.workflow_steps.length} nodes and {workflow.workflow_runs.length} recent runs.
        </p>
      </Modal>
    </div>
  );
}
