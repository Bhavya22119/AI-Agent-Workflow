-- =============================================================================
--  AI Agent Workflow Builder — initial schema
-- =============================================================================
--  Ownership chain enforced by foreign keys:
--    organizations -> org_members -> workflows -> workflow_steps / workflow_triggers
--    workflows -> workflow_runs -> step_runs
--
--  Every row that a permission check must reach is at most 3 joins away from
--  org_members, which is what makes the Hasura row-level filters cheap and
--  makes cross-org isolation structural rather than incidental.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
--  Enum types. Postgres enums (rather than text + CHECK) so that Hasura exposes
--  them as GraphQL enums: an invalid step type or status is rejected by the
--  GraphQL layer before it ever reaches Postgres.
-- -----------------------------------------------------------------------------
CREATE TYPE public.org_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TYPE public.step_type AS ENUM (
  'llm_call',
  'http_request',
  'db_write',
  'notify',
  'conditional_branch',
  'approval_gate'
);

CREATE TYPE public.trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');

CREATE TYPE public.run_status AS ENUM (
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE public.step_run_status AS ENUM (
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'skipped'
);

CREATE TYPE public.notification_status AS ENUM ('pending', 'sent', 'failed');

-- -----------------------------------------------------------------------------
--  Shared triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
--  organizations — the tenant boundary. Carries the usage quota for the period.
-- -----------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  slug               text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  quota_limit        integer NOT NULL DEFAULT 50 CHECK (quota_limit >= 0),
  quota_used         integer NOT NULL DEFAULT 0 CHECK (quota_used >= 0),
  quota_period_start timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  created_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.organizations.quota_used IS
  'Runs consumed in the current period. Incremented once per run that reaches a terminal state.';

-- -----------------------------------------------------------------------------
--  org_members — (user, org) -> role. The single source of truth for both
--  permission layers. Hasura roles cannot express this because a Hasura role
--  comes from the JWT and is global to the user, while these roles are per-org.
-- -----------------------------------------------------------------------------
CREATE TABLE public.org_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role       public.org_role NOT NULL DEFAULT 'viewer',
  invited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_user ON public.org_members (user_id);
CREATE INDEX idx_org_members_org ON public.org_members (org_id);
-- Covering index for the permission predicate that runs on every single request.
CREATE INDEX idx_org_members_user_org_role ON public.org_members (user_id, org_id, role);

CREATE TRIGGER set_org_members_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- An org must never be left without an owner, or it becomes unmanageable.
CREATE OR REPLACE FUNCTION public.prevent_orphaned_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id  uuid := COALESCE(OLD.org_id, NEW.org_id);
  v_owners  integer;
BEGIN
  -- Skip the check when the whole organization is going away.
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO v_owners
  FROM public.org_members
  WHERE org_id = v_org_id AND role = 'owner';

  IF v_owners = 0 THEN
    RAISE EXCEPTION 'org-must-keep-one-owner'
      USING HINT = 'Promote another member to owner before demoting or removing the last owner.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER trg_org_keeps_owner
  AFTER UPDATE OR DELETE ON public.org_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.prevent_orphaned_org();

-- -----------------------------------------------------------------------------
--  workflows
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflows_org ON public.workflows (org_id, created_at DESC);

CREATE TRIGGER set_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
--  workflow_steps — ordered by `position` (1-based, gapless is not required).
--  `config` is JSONB so each step type can carry its own shape; the engine
--  validates per type. Branch targets are stored as positions in config.
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflow_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows (id) ON DELETE CASCADE,
  position    integer NOT NULL CHECK (position > 0),
  type        public.step_type NOT NULL,
  name        text NOT NULL DEFAULT '' ,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_limit integer NOT NULL DEFAULT 1 CHECK (retry_limit BETWEEN 0 AND 5),
  timeout_ms  integer NOT NULL DEFAULT 25000 CHECK (timeout_ms BETWEEN 1000 AND 60000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_workflow_steps_workflow ON public.workflow_steps (workflow_id, position);

CREATE TRIGGER set_workflow_steps_updated_at
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.workflow_steps.retry_limit IS
  'Extra attempts after the first for external calls (llm_call, http_request). 1 = one retry.';

-- -----------------------------------------------------------------------------
--  workflow_triggers — how a run can be started.
--  `secret` is never exposed through the GraphQL API (see metadata: the column
--  is excluded from every select permission); owners fetch it via an Action.
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflow_triggers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL REFERENCES public.workflows (id) ON DELETE CASCADE,
  type            public.trigger_type NOT NULL,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Always server-generated: `secret` is not writable through any GraphQL
  -- permission, so a client can never weaken (or learn) a webhook secret.
  secret          text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex')
                    CHECK (char_length(secret) >= 32),
  cron_expression text,
  is_enabled      boolean NOT NULL DEFAULT true,
  last_fired_at   timestamptz,
  created_by      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_needs_cron
    CHECK (type <> 'scheduled' OR cron_expression IS NOT NULL)
);

-- At most one manual trigger per workflow; webhooks/schedules may repeat.
CREATE UNIQUE INDEX idx_one_manual_trigger
  ON public.workflow_triggers (workflow_id)
  WHERE type = 'manual';

CREATE INDEX idx_workflow_triggers_workflow ON public.workflow_triggers (workflow_id);
CREATE INDEX idx_workflow_triggers_scheduled
  ON public.workflow_triggers (type, is_enabled)
  WHERE type = 'scheduled';

CREATE TRIGGER set_workflow_triggers_updated_at
  BEFORE UPDATE ON public.workflow_triggers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
--  workflow_runs — one row per execution.
--  org_id is denormalised from the workflow so that run/step permission filters
--  and quota accounting never need a join through workflows.
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflow_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL REFERENCES public.workflows (id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  status          public.run_status NOT NULL DEFAULT 'pending',
  trigger_type    public.trigger_type NOT NULL DEFAULT 'manual',
  triggered_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  trigger_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  error           text,
  quota_counted   boolean NOT NULL DEFAULT false,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_runs_workflow ON public.workflow_runs (workflow_id, started_at DESC);
CREATE INDEX idx_workflow_runs_org ON public.workflow_runs (org_id, started_at DESC);
CREATE INDEX idx_workflow_runs_active
  ON public.workflow_runs (org_id)
  WHERE status IN ('pending', 'running', 'paused');

COMMENT ON COLUMN public.workflow_runs.quota_counted IS
  'Guard flag so a run can only ever consume one unit of quota, even if the engine retries.';

-- -----------------------------------------------------------------------------
--  step_runs — one row per step per run. This table is what the frontend
--  subscribes to for live progress, so it carries everything the UI renders.
-- -----------------------------------------------------------------------------
CREATE TABLE public.step_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id  uuid NOT NULL REFERENCES public.workflow_runs (id) ON DELETE CASCADE,
  workflow_step_id uuid NOT NULL REFERENCES public.workflow_steps (id) ON DELETE CASCADE,
  position         integer NOT NULL,
  step_type        public.step_type NOT NULL,
  status           public.step_run_status NOT NULL DEFAULT 'pending',
  input            jsonb,
  output           jsonb,
  error            text,
  attempt_count    integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  approved_by      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at      timestamptz,
  rejected_by      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  rejected_at      timestamptz,
  decision_note    text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_run_id, workflow_step_id)
);

CREATE INDEX idx_step_runs_run ON public.step_runs (workflow_run_id, position);
CREATE INDEX idx_step_runs_awaiting_approval
  ON public.step_runs (workflow_run_id)
  WHERE status = 'paused';

COMMENT ON COLUMN public.step_runs.step_type IS
  'Copied from workflow_steps at run creation so a run stays readable if the workflow is later edited.';

-- -----------------------------------------------------------------------------
--  workflow_outputs — the target of `db_write` steps ("save a result into your
--  own tables"). Kept append-only from the app's point of view.
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflow_outputs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  workflow_run_id uuid NOT NULL REFERENCES public.workflow_runs (id) ON DELETE CASCADE,
  step_run_id     uuid REFERENCES public.step_runs (id) ON DELETE SET NULL,
  key             text NOT NULL,
  value           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_outputs_org ON public.workflow_outputs (org_id, created_at DESC);
CREATE INDEX idx_workflow_outputs_run ON public.workflow_outputs (workflow_run_id);

-- -----------------------------------------------------------------------------
--  notifications — a `notify` step inserts a row here and returns immediately.
--  A Hasura Event Trigger on this table performs the actual delivery, so
--  delivery is retried by Hasura and never blocks or fails the run inline.
-- -----------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  workflow_run_id uuid REFERENCES public.workflow_runs (id) ON DELETE CASCADE,
  step_run_id     uuid REFERENCES public.step_runs (id) ON DELETE SET NULL,
  channel         text NOT NULL DEFAULT 'slack' CHECK (channel IN ('slack', 'email', 'log')),
  target          text,
  subject         text,
  body            text NOT NULL DEFAULT '',
  status          public.notification_status NOT NULL DEFAULT 'pending',
  error           text,
  attempt_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

CREATE INDEX idx_notifications_org ON public.notifications (org_id, created_at DESC);
CREATE INDEX idx_notifications_run ON public.notifications (workflow_run_id);

-- -----------------------------------------------------------------------------
--  watched_records — the "watched table" for database_event triggers. Inserting
--  a row here fires a Hasura Event Trigger which starts every enabled
--  database_event trigger in that org whose source_key matches.
-- -----------------------------------------------------------------------------
CREATE TABLE public.watched_records (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  source_key text NOT NULL DEFAULT 'default',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_watched_records_org ON public.watched_records (org_id, created_at DESC);

-- =============================================================================
--  Aggregation: org usage for the current period + average run duration.
--  Exposed to GraphQL as a tracked view with the same org-scoped permission as
--  every other table (via a manual relationship to organizations).
-- =============================================================================
CREATE VIEW public.org_usage_summary AS
SELECT
  o.id                                                        AS org_id,
  o.name                                                      AS org_name,
  o.quota_limit                                               AS quota_limit,
  o.quota_used                                                AS quota_used,
  GREATEST(o.quota_limit - o.quota_used, 0)                   AS quota_remaining,
  CASE WHEN o.quota_limit = 0 THEN 100
       ELSE round((o.quota_used::numeric / o.quota_limit) * 100, 1)
  END                                                         AS quota_used_pct,
  o.quota_period_start                                        AS period_start,
  (o.quota_period_start + interval '1 month')                 AS period_end,
  count(r.id) FILTER (
    WHERE r.started_at >= o.quota_period_start
  )                                                           AS runs_this_period,
  count(r.id) FILTER (WHERE r.status = 'completed')            AS runs_completed,
  count(r.id) FILTER (WHERE r.status = 'failed')               AS runs_failed,
  count(r.id) FILTER (
    WHERE r.status IN ('pending', 'running', 'paused')
  )                                                           AS runs_active,
  count(r.id)                                                 AS runs_total,
  COALESCE(
    round(avg(
      EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000
    ) FILTER (WHERE r.finished_at IS NOT NULL))::integer,
    0
  )                                                           AS avg_run_duration_ms,
  (SELECT count(*) FROM public.workflows w WHERE w.org_id = o.id) AS workflow_count
FROM public.organizations o
LEFT JOIN public.workflow_runs r ON r.org_id = o.id
GROUP BY o.id;

COMMENT ON VIEW public.org_usage_summary IS
  'Per-organization usage aggregation: quota consumption for the current period and average run duration.';

-- Computed field for organizations.avg_run_duration_ms (Hasura computed field,
-- demonstrating the same aggregate reachable directly from the org object).
CREATE OR REPLACE FUNCTION public.organization_avg_run_duration_ms(org_row public.organizations)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    round(avg(EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000))::integer,
    0
  )
  FROM public.workflow_runs r
  WHERE r.org_id = org_row.id AND r.finished_at IS NOT NULL;
$$;

-- =============================================================================
--  start_workflow_run — atomic run creation.
--
--  Everything that must not race lives in this one transaction:
--    * the caller's membership + role are re-checked in the database
--    * quota is checked against used + already-active runs, under a row lock
--      on the organization, so two concurrent triggers cannot both slip past
--      the last unit of quota
--    * the workflow_run and all of its step_runs are created together, so a
--      subscription never observes a run with a partial set of steps
--
--  Errors are raised with machine-readable messages that the Action handler
--  maps to GraphQL errors. Admin-only: no Hasura role can call it.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.start_workflow_run(
  p_workflow_id  uuid,
  p_user_id      uuid,
  p_trigger_type public.trigger_type,
  p_payload      jsonb,
  p_require_role boolean DEFAULT true
)
RETURNS SETOF public.workflow_runs
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_org_id      uuid;
  v_is_active   boolean;
  v_role        public.org_role;
  v_quota_limit integer;
  v_quota_used  integer;
  v_period      timestamptz;
  v_active_runs integer;
  v_step_count  integer;
  v_run_id      uuid;
BEGIN
  SELECT w.org_id, w.is_active INTO v_org_id, v_is_active
  FROM public.workflows w
  WHERE w.id = p_workflow_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'WORKFLOW_NOT_FOUND';
  END IF;

  IF NOT v_is_active THEN
    RAISE EXCEPTION 'WORKFLOW_INACTIVE';
  END IF;

  -- Membership + role. Skipped only for machine triggers (webhook / schedule /
  -- database event), which authenticate with a per-trigger secret instead of a
  -- user identity and therefore have no member row to check.
  IF p_require_role THEN
    SELECT m.role INTO v_role
    FROM public.org_members m
    WHERE m.org_id = v_org_id AND m.user_id = p_user_id;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;

    IF v_role NOT IN ('owner', 'editor') THEN
      RAISE EXCEPTION 'ROLE_CANNOT_RUN';
    END IF;
  END IF;

  -- Lock the org row so the quota decision is serialised per organization.
  SELECT o.quota_limit, o.quota_used, o.quota_period_start
    INTO v_quota_limit, v_quota_used, v_period
  FROM public.organizations o
  WHERE o.id = v_org_id
  FOR UPDATE;

  -- Roll the period forward lazily: the first run of a new period resets usage.
  IF now() >= v_period + interval '1 month' THEN
    UPDATE public.organizations
       SET quota_used = 0,
           quota_period_start = date_trunc('month', now())
     WHERE id = v_org_id;
    v_quota_used := 0;
  END IF;

  SELECT count(*) INTO v_active_runs
  FROM public.workflow_runs r
  WHERE r.org_id = v_org_id AND r.status IN ('pending', 'running', 'paused');

  -- Runs already in flight are counted as reserved so concurrent triggers
  -- cannot collectively exceed the limit.
  IF v_quota_used + v_active_runs >= v_quota_limit THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED';
  END IF;

  SELECT count(*) INTO v_step_count
  FROM public.workflow_steps s
  WHERE s.workflow_id = p_workflow_id;

  IF v_step_count = 0 THEN
    RAISE EXCEPTION 'WORKFLOW_HAS_NO_STEPS';
  END IF;

  INSERT INTO public.workflow_runs (workflow_id, org_id, status, trigger_type, triggered_by, trigger_payload)
  VALUES (p_workflow_id, v_org_id, 'pending', p_trigger_type, p_user_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_run_id;

  INSERT INTO public.step_runs (workflow_run_id, workflow_step_id, position, step_type, status)
  SELECT v_run_id, s.id, s.position, s.type, 'pending'
  FROM public.workflow_steps s
  WHERE s.workflow_id = p_workflow_id;

  RETURN QUERY SELECT * FROM public.workflow_runs WHERE id = v_run_id;
END;
$$;

COMMENT ON FUNCTION public.start_workflow_run(uuid, uuid, public.trigger_type, jsonb, boolean) IS
  'Atomically authorize, quota-check and create a run with all of its step_runs. Tracked in Hasura as an admin-only mutation.';

-- =============================================================================
--  consume_run_quota — increments the org counter at most once per run, in a
--  single statement pair inside one transaction, so a retried or concurrently
--  finalised run can never be billed twice. Returns the updated organization
--  (zero rows when the run had already been counted).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.consume_run_quota(p_run_id uuid)
RETURNS SETOF public.organizations
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  UPDATE public.workflow_runs
     SET quota_counted = true
   WHERE id = p_run_id AND quota_counted = false
  RETURNING org_id INTO v_org_id;

  IF v_org_id IS NULL THEN
    RETURN;   -- already counted, or no such run: emit no rows
  END IF;

  RETURN QUERY
  UPDATE public.organizations
     SET quota_used = quota_used + 1
   WHERE id = v_org_id
  RETURNING *;
END;
$$;
