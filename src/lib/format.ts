import type { Json, RunStatus, StepRunStatus } from './types';

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function duration(from: string | null, to: string | null): string {
  if (!from) return '—';
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function millis(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function prettyJson(value: Json | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

/** One-line summary of a step's output for the collapsed timeline row. */
export function summarizeOutput(value: Json | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return truncate(value, 120);
  if (typeof value !== 'object' || Array.isArray(value)) return truncate(String(value), 120);

  const record = value as Record<string, Json>;
  if (typeof record.text === 'string') return truncate(record.text, 120);
  if (record.branch !== undefined) {
    const evaluated = record.evaluated as Record<string, Json> | undefined;
    const target = record.ends_run
      ? 'nothing connected — this path ends'
      : `→ ${String(record.followed)}`;
    const test = evaluated
      ? ` (“${truncate(String(evaluated.left ?? ''), 40)}” ${String(evaluated.operator)} “${String(evaluated.right ?? '')}”)`
      : '';
    return `${String(record.branch)} ${target}${test}`;
  }
  if (record.status !== undefined && record.ok !== undefined) {
    return `HTTP ${String(record.status)}`;
  }
  if (record.awaiting_approval) return truncate(String(record.message ?? 'Awaiting approval'), 120);
  if (record.approved === true) return 'Approved';
  if (record.approved === false) return 'Rejected';
  if (record.notification_id) return `Queued a ${String(record.channel)} notification`;
  if (record.key !== undefined) return `Saved “${String(record.key)}”`;
  return truncate(JSON.stringify(record), 120);
}

export function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  paused: 'Awaiting approval',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Rejected',
};

export const STEP_STATUS_LABEL: Record<StepRunStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  paused: 'Awaiting approval',
  completed: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
};

/** Tailwind classes per status: one place so every badge agrees. */
export function statusTone(status: RunStatus | StepRunStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-ok-soft text-ok';
    case 'running':
      return 'bg-info-soft text-info';
    case 'paused':
      return 'bg-warn-soft text-warn';
    case 'failed':
      return 'bg-danger-soft text-danger';
    case 'cancelled':
      return 'bg-danger-soft text-danger';
    case 'skipped':
      return 'bg-surface-2 text-ink-3';
    default:
      return 'bg-surface-2 text-ink-2';
  }
}
