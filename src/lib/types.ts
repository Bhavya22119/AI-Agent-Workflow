export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type OrgRole = 'owner' | 'editor' | 'viewer';

export type StepType =
  | 'llm_call'
  | 'http_request'
  | 'db_write'
  | 'notify'
  | 'conditional_branch'
  | 'approval_gate';

export type TriggerType = 'manual' | 'webhook' | 'scheduled' | 'database_event';

export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type StepRunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  quota_limit: number;
  quota_used: number;
  quota_period_start: string;
}

export interface Membership {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  organization: Organization;
  user?: { id: string; displayName: string | null; email: string | null };
}

/** Outgoing edges of a step: output handle -> target step key. */
export type StepEdges = Partial<Record<'main' | 'true' | 'false', string>>;

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  position: number;
  /** Stable per-workflow node id. Edges reference this, not `id`. */
  key: string;
  type: StepType;
  name: string;
  config: Record<string, Json>;
  next: StepEdges;
  canvas_x: number;
  canvas_y: number;
  retry_limit: number;
  timeout_ms: number;
}

export interface WorkflowTrigger {
  id: string;
  workflow_id: string;
  type: TriggerType;
  config: Record<string, Json>;
  cron_expression: string | null;
  is_enabled: boolean;
  last_fired_at: string | null;
}

export interface WorkflowRunSummary {
  id: string;
  status: RunStatus;
  trigger_type: TriggerType;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  workflow_steps: WorkflowStep[];
  workflow_triggers: WorkflowTrigger[];
  workflow_runs: WorkflowRunSummary[];
  workflow_steps_aggregate?: { aggregate: { count: number } | null };
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  position: number;
  step_type: StepType;
  status: StepRunStatus;
  input: Json;
  output: Json;
  error: string | null;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  decision_note: string | null;
  started_at: string | null;
  finished_at: string | null;
  workflow_step?: { name: string; type: StepType; config: Record<string, Json> };
  approver?: { id: string; displayName: string | null; email: string | null } | null;
}

export interface WorkflowRun extends WorkflowRunSummary {
  workflow_id: string;
  org_id: string;
  trigger_payload: Json;
  triggered_by: string | null;
  workflow?: { id: string; name: string };
  step_runs: StepRun[];
}

export interface UsageSummary {
  org_id: string;
  org_name: string;
  quota_limit: number;
  quota_used: number;
  quota_remaining: number;
  quota_used_pct: number;
  period_start: string;
  period_end: string;
  runs_this_period: number;
  runs_completed: number;
  runs_failed: number;
  runs_active: number;
  runs_total: number;
  avg_run_duration_ms: number;
  workflow_count: number;
}

export interface Notification {
  id: string;
  channel: string;
  target: string | null;
  subject: string | null;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface WorkflowOutput {
  id: string;
  key: string;
  value: Json;
  created_at: string;
}

/** Draft shapes used by the builder before rows exist in the database. */
export interface DraftStep {
  /** Stable node id: the canvas node id, and what edges point at. */
  key: string;
  /** Present when this step already exists in the database. */
  id?: string;
  type: StepType;
  name: string;
  config: Record<string, Json>;
  /** Output handle -> target key. Edited by dragging connections. */
  next: StepEdges;
  canvas_x: number;
  canvas_y: number;
  retry_limit: number;
  timeout_ms: number;
}

export interface DraftTrigger {
  key: string;
  id?: string;
  type: TriggerType;
  config: Record<string, Json>;
  cron_expression: string | null;
  is_enabled: boolean;
  /** Read-only, shown in the builder for saved triggers. */
  last_fired_at?: string | null;
}
