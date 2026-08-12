/**
 * The two non-manual, non-webhook trigger types.
 *
 *   database_event — a row inserted into `watched_records` starts a run for
 *                    every enabled database_event trigger in that org whose
 *                    `source_key` matches. No button, no user session; the run
 *                    is attributed to the trigger, not a person.
 *
 *   scheduled      — a Hasura Cron Trigger ticks once a minute and this module
 *                    decides which schedules are due, by evaluating each
 *                    trigger's cron expression against its last_fired_at.
 *
 * Both go through start_workflow_run() like every other path, so quota and
 * workflow state are enforced identically no matter what started the run.
 */
import { CronExpressionParser } from 'cron-parser';
import { adminGraphql } from './hasura';
import { runInBackground } from './engine/runner';
import { RunStartError, startRun } from './engine/store';
import type { Json } from './engine/types';

export interface StartedRun {
  trigger_id: string;
  workflow_id: string;
  workflow_run_id?: string;
  skipped?: string;
}

async function markFired(triggerId: string): Promise<void> {
  await adminGraphql(
    `mutation MarkFired($id: uuid!, $at: timestamptz!) {
       update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: { last_fired_at: $at }) { id }
     }`,
    { id: triggerId, at: new Date().toISOString() },
  );
}

/**
 * Starts a run for a machine trigger, converting an expected refusal (quota
 * exhausted, workflow inactive) into a recorded skip rather than an exception —
 * one workflow at its quota must not stop the rest of the tick.
 */
async function startForTrigger(
  trigger: { id: string; workflow_id: string },
  triggerType: 'database_event' | 'scheduled',
  payload: Json,
  runs: StartedRun[],
): Promise<void> {
  try {
    const run = await startRun({
      workflowId: trigger.workflow_id,
      userId: null,
      triggerType,
      payload,
      requireRole: false,
    });
    await markFired(trigger.id);
    runs.push({
      trigger_id: trigger.id,
      workflow_id: trigger.workflow_id,
      workflow_run_id: run.id,
    });
    void runInBackground(run.id);
  } catch (error) {
    if (error instanceof RunStartError) {
      runs.push({
        trigger_id: trigger.id,
        workflow_id: trigger.workflow_id,
        skipped: error.code,
      });
      return;
    }
    throw error;
  }
}

/* ------------------------------------------------------------ database_event */

export interface WatchedRecord {
  id: string;
  org_id: string;
  source_key: string | null;
  payload: Json;
}

export async function handleWatchedRecord(record: WatchedRecord): Promise<StartedRun[]> {
  const sourceKey = record.source_key ?? 'default';

  const data = await adminGraphql<{
    workflow_triggers: Array<{
      id: string;
      workflow_id: string;
      config: Record<string, Json>;
    }>;
  }>(
    `query DatabaseEventTriggers($orgId: uuid!) {
       workflow_triggers(
         where: {
           type: { _eq: database_event }
           is_enabled: { _eq: true }
           workflow: { org_id: { _eq: $orgId }, is_active: { _eq: true } }
         }
       ) {
         id
         workflow_id
         config
       }
     }`,
    { orgId: record.org_id },
  );

  // A trigger with no source_key in its config listens to every watched record
  // in its own org; one with a source_key listens only to matching rows.
  const matching = data.workflow_triggers.filter((trigger) => {
    const wanted = trigger.config?.source_key;
    return wanted === undefined || wanted === null || wanted === '' || wanted === sourceKey;
  });

  const runs: StartedRun[] = [];
  for (const trigger of matching) {
    await startForTrigger(
      trigger,
      'database_event',
      {
        source: 'watched_records',
        source_key: sourceKey,
        watched_record_id: record.id,
        ...(record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
          ? record.payload
          : { value: record.payload }),
      },
      runs,
    );
  }
  return runs;
}

/* ----------------------------------------------------------------- scheduled */

/** True when `expression` has a firing time between last_fired_at and now. */
export function isScheduleDue(
  expression: string,
  lastFiredAt: string | null,
  now: Date,
  timezone?: string,
): boolean {
  // First tick after creation: start from a minute ago so a schedule does not
  // wait a full interval before its first run.
  const since = lastFiredAt ? new Date(lastFiredAt) : new Date(now.getTime() - 60_000);
  if (Number.isNaN(since.getTime())) return false;
  if (since >= now) return false;

  const interval = CronExpressionParser.parse(expression, {
    currentDate: since,
    ...(timezone ? { tz: timezone } : {}),
  });
  const nextRun = interval.next().toDate();
  return nextRun <= now;
}

export async function runDueSchedules(now = new Date()): Promise<StartedRun[]> {
  const data = await adminGraphql<{
    workflow_triggers: Array<{
      id: string;
      workflow_id: string;
      cron_expression: string | null;
      last_fired_at: string | null;
      config: Record<string, Json>;
    }>;
  }>(
    `query ScheduledTriggers {
       workflow_triggers(
         where: {
           type: { _eq: scheduled }
           is_enabled: { _eq: true }
           workflow: { is_active: { _eq: true } }
         }
       ) {
         id
         workflow_id
         cron_expression
         last_fired_at
         config
       }
     }`,
  );

  const runs: StartedRun[] = [];
  for (const trigger of data.workflow_triggers) {
    if (!trigger.cron_expression) continue;

    let due = false;
    try {
      due = isScheduleDue(
        trigger.cron_expression,
        trigger.last_fired_at,
        now,
        typeof trigger.config?.timezone === 'string' ? trigger.config.timezone : undefined,
      );
    } catch (error) {
      // A malformed cron expression should be reported, not fatal for the tick.
      console.error(
        `[cron] trigger ${trigger.id} has an invalid cron expression ` +
          `"${trigger.cron_expression}": ${error instanceof Error ? error.message : error}`,
      );
      continue;
    }
    if (!due) continue;

    await startForTrigger(
      trigger,
      'scheduled',
      {
        source: 'schedule',
        cron_expression: trigger.cron_expression,
        fired_at: now.toISOString(),
      },
      runs,
    );
  }
  return runs;
}
