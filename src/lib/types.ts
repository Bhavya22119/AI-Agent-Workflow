export type Role = 'owner' | 'editor' | 'viewer' | 'pending';
export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'skipped';

export interface Organization {
  id: string;
  name: string;
  quota_limit: number;
  quota_used: number;
}

export interface OrgMember {
  id: string;
  user_id: string;
  org_id: string;
  role: Role;
  user: {
    displayName: string;
    email: string;
  };
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  latest_run?: WorkflowRun[];
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  position: number;
  type: 'llm_call' | 'http_request' | 'db_write' | 'notify' | 'conditional_branch' | 'approval_gate';
  config: any;
}

export interface WorkflowTrigger {
  id: string;
  workflow_id: string;
  type: 'webhook' | 'schedule' | 'manual';
  config: any;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: RunStatus;
  started_at: string;
  completed_at?: string;
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  step_id: string;
  status: RunStatus;
  started_at: string;
  completed_at?: string;
  input: any;
  output: any;
  error?: string;
  attempt_count: number;
  step: WorkflowStep;
}
