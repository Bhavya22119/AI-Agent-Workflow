CREATE TYPE org_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE step_type AS ENUM ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed');
CREATE TYPE step_run_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'skipped');

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    quota_allowed int DEFAULT 100,
    quota_used int DEFAULT 0,
    usage_period_start timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE org_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    role org_role NOT NULL DEFAULT 'viewer',
    created_at timestamptz DEFAULT now(),
    UNIQUE(org_id, user_id)
);

CREATE TABLE workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE workflow_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    position int NOT NULL,
    type step_type NOT NULL,
    config jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(workflow_id, position)
);

CREATE TABLE workflow_triggers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    type trigger_type NOT NULL,
    config jsonb DEFAULT '{}',
    webhook_secret text,
    enabled bool DEFAULT true,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE workflow_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status run_status NOT NULL DEFAULT 'pending',
    started_by uuid,
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    context jsonb DEFAULT '{}'
);

CREATE TABLE step_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    workflow_step_id uuid NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
    position int NOT NULL,
    status step_run_status NOT NULL DEFAULT 'pending',
    input jsonb,
    output jsonb,
    error text,
    attempt_count int DEFAULT 0,
    approved_by uuid,
    approved_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz
);

CREATE TABLE workflow_outputs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    key text NOT NULL,
    value jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE watched_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payload jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_org_members_org_id ON org_members(org_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_user_org ON org_members(user_id, org_id);
CREATE INDEX idx_workflows_org_id ON workflows(org_id);
CREATE INDEX idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX idx_workflow_triggers_workflow_id ON workflow_triggers(workflow_id);
CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_org_id ON workflow_runs(org_id);
CREATE INDEX idx_step_runs_workflow_run_id ON step_runs(workflow_run_id);
CREATE INDEX idx_step_runs_workflow_step_id ON step_runs(workflow_step_id);
CREATE INDEX idx_workflow_outputs_org_id ON workflow_outputs(org_id);
CREATE INDEX idx_workflow_outputs_run_id ON workflow_outputs(workflow_run_id);
CREATE INDEX idx_watched_records_org_id ON watched_records(org_id);

CREATE VIEW org_usage_summary AS
SELECT
    o.id as org_id,
    o.name,
    o.quota_allowed,
    (SELECT COUNT(*)::integer FROM workflow_runs wr WHERE wr.org_id = o.id) as quota_used,
    o.usage_period_start,
    (o.quota_allowed - (SELECT COUNT(*)::integer FROM workflow_runs wr WHERE wr.org_id = o.id)) as quota_remaining,
    ROUND(((SELECT COUNT(*)::numeric FROM workflow_runs wr WHERE wr.org_id = o.id) / NULLIF(o.quota_allowed, 0)::numeric) * 100, 2) as usage_percentage,
    (SELECT COUNT(*) FROM workflow_runs wr WHERE wr.org_id = o.id) as total_runs,
    (SELECT COUNT(*) FROM workflows w WHERE w.org_id = o.id) as total_workflows
FROM organizations o;

CREATE OR REPLACE FUNCTION increment_quota_used(org_uuid uuid)
RETURNS void AS $$
BEGIN
    UPDATE organizations SET quota_used = quota_used + 1 WHERE id = org_uuid;
END;
$$ LANGUAGE plpgsql;
