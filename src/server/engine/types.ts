export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type StepType =
  | 'llm_call'
  | 'http_request'
  | 'db_write'
  | 'notify'
  | 'conditional_branch'
  | 'approval_gate';

export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type StepRunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'skipped';

export type TriggerType = 'manual' | 'webhook' | 'scheduled' | 'database_event';

/** Outgoing edges of a step: handle -> target step key. */
export type StepEdges = Partial<Record<'main' | 'true' | 'false', string>>;

/** A step_run joined with the workflow_step definition it executes. */
export interface LoadedStep {
  id: string;
  workflow_step_id: string;
  position: number;
  step_type: StepType;
  status: StepRunStatus;
  output: Json;
  workflow_step: {
    /** Stable per-workflow node id that edges reference. */
    key: string;
    name: string;
    config: Record<string, Json>;
    /** handle -> target key. Empty means "this branch of the graph ends here". */
    next: StepEdges;
    retry_limit: number;
    timeout_ms: number;
  };
}

export interface LoadedRun {
  id: string;
  workflow_id: string;
  org_id: string;
  status: RunStatus;
  trigger_type: TriggerType;
  trigger_payload: Json;
  context: Json;
  step_runs: LoadedStep[];
}

/** Values available to `{{ ... }}` templates inside step configs. */
export interface RunContext {
  run: { id: string; workflow_id: string; org_id: string };
  trigger: { type: TriggerType; payload: Json };
  /** Output of the most recently completed step. */
  prev: Json;
  /** Every completed step's output, keyed by position: {{steps.2.output.text}} */
  steps: Record<string, { type: StepType; status: StepRunStatus; output: Json }>;
}

/** What a step executor returns to the runner. */
export type StepOutcome =
  | { kind: 'output'; output: Json }
  /** approval_gate: stop here, run becomes `paused`. */
  | { kind: 'pause'; output: Json }
  /**
   * conditional_branch: the runner follows the `true` or `false` edge. The step
   * itself does not decide *where* to go — that is what the canvas connection
   * says — only which of its two outputs is taken.
   */
  | { kind: 'branch'; output: Json; handle: 'true' | 'false' };

export interface StepExecutionContext {
  run: LoadedRun;
  step: LoadedStep;
  config: Record<string, Json>;
  ctx: RunContext;
  /** Called before every attempt so attempt_count reflects reality in the UI. */
  onAttempt: (attempt: number) => Promise<void>;
}
