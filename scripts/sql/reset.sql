-- =============================================================================
--  Hard reset of the application schema.
--
--  Used by `npm run db:reset` before re-applying the init migration. Drops
--  everything this app owns in `public`, including objects left behind by
--  earlier versions of the schema, and nothing else. The Nhost-managed `auth`
--  and `storage` schemas (and therefore all user accounts) are never touched.
-- =============================================================================

DROP VIEW IF EXISTS public.org_usage_summary CASCADE;

DROP TABLE IF EXISTS public.llm_connections CASCADE;
DROP TABLE IF EXISTS public.watched_records CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.workflow_outputs CASCADE;
DROP TABLE IF EXISTS public.step_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_triggers CASCADE;
DROP TABLE IF EXISTS public.workflow_steps CASCADE;
DROP TABLE IF EXISTS public.workflows CASCADE;
DROP TABLE IF EXISTS public.org_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

-- Functions: current schema.
DROP FUNCTION IF EXISTS public.create_organization(text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.consume_run_quota(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.start_workflow_run(uuid, uuid, text, jsonb, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.start_workflow_run(uuid, uuid, public.trigger_type, jsonb, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.organization_avg_run_duration_ms(public.organizations) CASCADE;
DROP FUNCTION IF EXISTS public.prevent_orphaned_org() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

-- Functions: legacy names from the previous implementation.
DROP FUNCTION IF EXISTS public.increment_quota_used(uuid) CASCADE;

-- Enum types last: CASCADE clears any column defaults still referencing them.
DROP TYPE IF EXISTS public.notification_status CASCADE;
DROP TYPE IF EXISTS public.step_run_status CASCADE;
DROP TYPE IF EXISTS public.run_status CASCADE;
DROP TYPE IF EXISTS public.trigger_type CASCADE;
DROP TYPE IF EXISTS public.step_type CASCADE;
DROP TYPE IF EXISTS public.org_role CASCADE;

DROP TABLE IF EXISTS public.schema_migrations CASCADE;
