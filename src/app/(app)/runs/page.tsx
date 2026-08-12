'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';
import { useOrg } from '@/components/providers/org-provider';
import { TriggerIcon } from '@/components/step-icon';
import { Badge, RunStatusBadge } from '@/components/ui/badge';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Card, CardHeader, EmptyState } from '@/components/ui/surface';
import { useSubscription } from '@/hooks/use-subscription';
import { duration, relativeTime } from '@/lib/format';
import { ORG_RUNS_SUBSCRIPTION } from '@/lib/gql';
import type { RunStatus, TriggerType } from '@/lib/types';

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

export default function RunsPage() {
  const { activeOrgId, activeMembership } = useOrg();
  const { data, error, connecting } = useSubscription<OrgRunsData>(
    ORG_RUNS_SUBSCRIPTION,
    { orgId: activeOrgId, limit: 50 },
    { skip: !activeOrgId },
  );

  if (connecting && !data) return <PageLoader label="Connecting to the live run feed…" />;

  const runs = data?.workflow_runs ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink">Runs</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          Every run in {activeMembership?.organization.name}, streamed live — whether it was started
          by a person, a webhook, a schedule or a database event.
        </p>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardHeader title="Recent runs" description={`${runs.length} shown`} />
        {runs.length === 0 ? (
          <EmptyState
            icon={<Activity className="size-6" />}
            title="No runs yet"
            description="Trigger a workflow to see it appear here in real time."
          />
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <RunStatusBadge status={run.status} />
                <Link
                  href={`/runs/${run.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-accent"
                >
                  {run.workflow?.name ?? 'Workflow'}
                </Link>
                <Badge>
                  <TriggerIcon type={run.trigger_type} className="size-3" />
                  {run.trigger_type}
                </Badge>
                <span className="shrink-0 text-xs tabular-nums text-ink-3">
                  {duration(run.started_at, run.finished_at)}
                </span>
                <span className="shrink-0 text-xs text-ink-3">{relativeTime(run.started_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
