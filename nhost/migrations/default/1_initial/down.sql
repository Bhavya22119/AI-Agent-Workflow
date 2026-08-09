DROP FUNCTION IF EXISTS increment_quota_used(uuid);
DROP VIEW IF EXISTS org_usage_summary;

DROP INDEX IF EXISTS idx_watched_records_org_id;
DROP INDEX IF EXISTS idx_workflow_outputs_run_id;
DROP INDEX IF EXISTS idx_workflow_outputs_org_id;
DROP INDEX IF EXISTS idx_step_runs_workflow_step_id;
DROP INDEX IF EXISTS idx_step_runs_workflow_run_id;
DROP INDEX IF EXISTS idx_workflow_runs_org_id;
DROP INDEX IF EXISTS idx_workflow_runs_workflow_id;
DROP INDEX IF EXISTS idx_workflow_triggers_workflow_id;
DROP INDEX IF EXISTS idx_workflow_steps_workflow_id;
DROP INDEX IF EXISTS idx_workflows_org_id;
DROP INDEX IF EXISTS idx_org_members_user_org;
DROP INDEX IF EXISTS idx_org_members_user_id;
DROP INDEX IF EXISTS idx_org_members_org_id;

DROP TABLE IF EXISTS watched_records;
DROP TABLE IF EXISTS workflow_outputs;
DROP TABLE IF EXISTS step_runs;
DROP TABLE IF EXISTS workflow_runs;
DROP TABLE IF EXISTS workflow_triggers;
DROP TABLE IF EXISTS workflow_steps;
DROP TABLE IF EXISTS workflows;
DROP TABLE IF EXISTS org_members;
DROP TABLE IF EXISTS organizations;

DROP TYPE IF EXISTS step_run_status;
DROP TYPE IF EXISTS run_status;
DROP TYPE IF EXISTS trigger_type;
DROP TYPE IF EXISTS step_type;
DROP TYPE IF EXISTS org_role;
