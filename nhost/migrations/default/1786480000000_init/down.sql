-- Reverses 1786480000000_init. Drops only objects owned by this application;
-- the auth / storage schemas managed by Nhost are untouched.

DROP FUNCTION IF EXISTS public.consume_run_quota(uuid);
DROP FUNCTION IF EXISTS public.start_workflow_run(uuid, uuid, public.trigger_type, jsonb, boolean);
DROP FUNCTION IF EXISTS public.organization_avg_run_duration_ms(public.organizations);

DROP VIEW IF EXISTS public.org_usage_summary;

DROP TABLE IF EXISTS public.watched_records;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.workflow_outputs;
DROP TABLE IF EXISTS public.step_runs;
DROP TABLE IF EXISTS public.workflow_runs;
DROP TABLE IF EXISTS public.workflow_triggers;
DROP TABLE IF EXISTS public.workflow_steps;
DROP TABLE IF EXISTS public.workflows;
DROP TABLE IF EXISTS public.org_members;
DROP TABLE IF EXISTS public.organizations;

DROP FUNCTION IF EXISTS public.prevent_orphaned_org();
DROP FUNCTION IF EXISTS public.set_updated_at();

DROP TYPE IF EXISTS public.notification_status;
DROP TYPE IF EXISTS public.step_run_status;
DROP TYPE IF EXISTS public.run_status;
DROP TYPE IF EXISTS public.trigger_type;
DROP TYPE IF EXISTS public.step_type;
DROP TYPE IF EXISTS public.org_role;
