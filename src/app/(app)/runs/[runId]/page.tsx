'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Radio } from 'lucide-react';
import { useOrg } from '@/components/providers/org-provider';
import { ApprovalPanel } from '@/components/run/approval-panel';
import { StepTimeline } from '@/components/run/step-timeline';
import { WorkflowCanvas } from '@/components/canvas/workflow-canvas';
import {
  statusesFromRun,
  toDraftSteps,
  toDraftTriggers,
} from '@/components/canvas/graph-model';
import { WORKFLOW_DETAIL } from '@/lib/gql';
import { Badge, RunStatusBadge } from '@/components/ui/badge';
import { Alert, PageLoader, Spinner } from '@/components/ui/feedback';
import { Card, CardHeader, JsonBlock, Stat } from '@/components/ui/surface';
import { TriggerIcon } from '@/components/step-icon';
import { useQuery } from '@/hooks/use-query';
import { useSubscription } from '@/hooks/use-subscription';
import { duration, prettyJson, relativeTime } from '@/lib/format';
import { RUN_DETAIL, RUN_STATUS_SUBSCRIPTION, STEP_RUNS_SUBSCRIPTION } from '@/lib/gql';
import type {
  Notification,
  RunStatus,
  StepRun,
  Workflow,
  WorkflowOutput,
  WorkflowRun,
} from '@/lib/types';

interface RunDetailData {
  workflow_runs_by_pk:
    | (WorkflowRun & { workflow_outputs: WorkflowOutput[]; notifications: Notification[] })
    | null;
}

export default function RunPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;
  const { role } = useOrg();
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);

  // Static parts of the run (payload, outputs, notifications) are fetched…
  const { data, loading, refetch } = useQuery<RunDetailData>(
    RUN_DETAIL,
    { id: runId },
    { skip: !runId },
  );

  // …and the parts that change are subscribed to, which is what makes the page
  // update step by step with no refresh.
  const { data: liveSteps, error: stepsError, connecting } = useSubscription<{
    step_runs: StepRun[];
  }>(STEP_RUNS_SUBSCRIPTION, { runId }, { skip: !runId });

  const { data: liveRun } = useSubscription<{
    workflow_runs_by_pk: {
      id: string;
      status: RunStatus;
      error: string | null;
      started_at: string;
      finished_at: string | null;
    } | null;
  }>(RUN_STATUS_SUBSCRIPTION, { runId }, { skip: !runId });

  // The workflow graph, so the run can be drawn on the same canvas it was built
  // on. Read-only here: the nodes only carry live status.
  const { data: workflowData } = useQuery<{ workflows_by_pk: Workflow | null }>(
    WORKFLOW_DETAIL,
    { id: data?.workflow_runs_by_pk?.workflow_id },
    { skip: !data?.workflow_runs_by_pk?.workflow_id },
  );

  const run = data?.workflow_runs_by_pk ?? null;
  const liveStatus = liveRun?.workflow_runs_by_pk;
  const stepRuns = liveSteps?.step_runs ?? [];
  const status: RunStatus = liveStatus?.status ?? run?.status ?? 'pending';
  const finishedAt = liveStatus?.finished_at ?? run?.finished_at ?? null;
  const startedAt = liveStatus?.started_at ?? run?.started_at ?? null;

  if (loading && !data) return <PageLoader label="Loading run…" />;

  // Another tenant's run id resolves to nothing: the row is not in this caller's
  // result set, and neither is its step_runs stream.
  if (!run) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <Alert tone="warning" title="Run not found">
          This run does not exist, or it belongs to an organization you are not a member of.
        </Alert>
      </div>
    );
  }

  const completed = stepRuns.filter((step) => step.status === 'completed').length;
  const total = stepRuns.length;

  const graphWorkflow = workflowData?.workflows_by_pk ?? null;
  const graphSteps = graphWorkflow ? toDraftSteps(graphWorkflow) : [];
  const graphTriggers = graphWorkflow ? toDraftTriggers(graphWorkflow) : [];
  const statusByKey = statusesFromRun(stepRuns, graphSteps);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/workflows/${run.workflow_id}`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            {run.workflow?.name ?? 'Workflow'}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-ink">Run</h1>
            <RunStatusBadge status={status} />
            <Badge>
              <TriggerIcon type={run.trigger_type} className="size-3" />
              {run.trigger_type}
            </Badge>
            <span className="font-mono text-xs text-ink-3">{run.id.slice(0, 8)}</span>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-ink-3">
          {connecting ? (
            <Spinner label="Connecting to the live stream…" />
          ) : stepsError ? (
            <span className="text-danger">Live stream error: {stepsError}</span>
          ) : (
            <>
              <Radio className="size-3.5 text-ok" />
              live via GraphQL subscription
            </>
          )}
        </span>
      </div>

      {decisionNotice ? <Alert tone="success">{decisionNotice}</Alert> : null}

      {status === 'failed' && (liveStatus?.error ?? run.error) ? (
        <Alert tone="danger" title="This run failed">
          {liveStatus?.error ?? run.error}
        </Alert>
      ) : null}

      {status === 'cancelled' ? (
        <Alert tone="warning" title="Rejected at the approval gate">
          {liveStatus?.error ?? run.error ?? 'An approver rejected this run, so it stopped.'}
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Progress" value={`${completed}/${total}`} sub="steps completed" />
        <Stat
          label="Elapsed"
          value={duration(startedAt, finishedAt)}
          sub={finishedAt ? `finished ${relativeTime(finishedAt)}` : 'still running'}
        />
        <Stat label="Started" value={relativeTime(startedAt)} sub={run.trigger_type} />
      </div>

      {graphWorkflow ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Graph</h2>
          <WorkflowCanvas
            orgId={run.org_id}
            role={role}
            readOnly
            steps={graphSteps}
            triggers={graphTriggers}
            onStepsChange={() => undefined}
            onTriggersChange={() => undefined}
            statusByKey={statusByKey}
            className="relative h-[46vh] min-h-[320px] w-full overflow-hidden rounded-card border border-line bg-canvas"
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Steps</h2>
        {stepRuns.length === 0 && connecting ? (
          <Card className="p-6">
            <Spinner label="Waiting for the first step…" />
          </Card>
        ) : (
          <StepTimeline stepRuns={stepRuns}>
            {(stepRun) =>
              stepRun.status === 'paused' && stepRun.step_type === 'approval_gate' ? (
                <ApprovalPanel
                  stepRun={stepRun}
                  role={role}
                  onDecided={(result) => {
                    setDecisionNotice(
                      result.decision === 'approved'
                        ? 'Approved — the run resumed from the next step.'
                        : 'Rejected — the run was cancelled.',
                    );
                    void refetch();
                  }}
                />
              ) : null
            }
          </StepTimeline>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Trigger payload" description="What the run started with." />
          <div className="p-3">
            <JsonBlock text={prettyJson(run.trigger_payload) || '{}'} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Database writes"
            description="Rows written by db_write steps into workflow_outputs."
          />
          {run.workflow_outputs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-3">Nothing written yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {run.workflow_outputs.map((output) => (
                <li key={output.id} className="space-y-1.5 px-3 py-2.5">
                  <p className="font-mono text-xs font-medium text-ink-2">{output.key}</p>
                  <JsonBlock text={prettyJson(output.value)} className="max-h-40" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {run.notifications.length > 0 ? (
        <Card>
          <CardHeader
            title="Notifications"
            description="Queued by notify steps and delivered by the notification_created Event Trigger."
          />
          <ul className="divide-y divide-line">
            {run.notifications.map((notification) => (
              <li key={notification.id} className="flex items-start gap-3 px-4 py-2.5">
                <Badge
                  tone={
                    notification.status === 'sent'
                      ? 'bg-ok-soft text-ok'
                      : notification.status === 'failed'
                        ? 'bg-danger-soft text-danger'
                        : 'bg-surface-2 text-ink-3'
                  }
                >
                  {notification.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {notification.subject ?? `${notification.channel} notification`}
                  </p>
                  <p className="text-xs text-ink-3">{notification.body}</p>
                  {notification.error ? (
                    <p className="mt-1 text-xs text-danger">{notification.error}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-ink-3">{notification.channel}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
