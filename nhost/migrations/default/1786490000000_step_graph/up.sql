-- =============================================================================
--  Turn the step list into a real graph, so the builder can be a node canvas.
-- =============================================================================
--  Before: execution order was `position`, and a conditional_branch jumped to a
--  target position. That is fine for a list UI but cannot express a canvas where
--  you drag a connection from one node's output to another node's input.
--
--  After: every step has
--    * `key`       a stable, client-generated id. Saving a workflow deletes and
--                  re-inserts its steps (positions are unique per workflow, so an
--                  in-place reorder would collide), which means row ids change on
--                  every save — edges therefore cannot reference ids.
--    * `next`      handle -> target key. {"main": "node_x"} for an ordinary step;
--                  {"true": "node_y", "false": "node_z"} for a branch.
--    * canvas_x/y  where the node sits on the canvas.
--
--  `position` is kept: it is the topological order, recomputed on save, and it is
--  what orders step_runs in the run timeline and the live subscription.
-- =============================================================================

ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS key      text,
  ADD COLUMN IF NOT EXISTS next     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS canvas_x double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canvas_y double precision NOT NULL DEFAULT 0;

-- Backfill: give existing steps a key, lay them out left to right, and rebuild
-- the edges that `position` and the branch config used to imply.
DO $$
DECLARE
  v_workflow uuid;
  v_step     record;
  v_target   text;
BEGIN
  UPDATE public.workflow_steps
     SET key = 'node_' || replace(substr(id::text, 1, 8), '-', '')
   WHERE key IS NULL;

  FOR v_workflow IN SELECT DISTINCT workflow_id FROM public.workflow_steps LOOP
    FOR v_step IN
      SELECT id, key, position, type, config
        FROM public.workflow_steps
       WHERE workflow_id = v_workflow
       ORDER BY position
    LOOP
      -- A tidy left-to-right chain as the starting layout.
      UPDATE public.workflow_steps
         SET canvas_x = (v_step.position - 1) * 260,
             canvas_y = 0
       WHERE id = v_step.id;

      IF v_step.type = 'conditional_branch' THEN
        -- Resolve the old positional branch targets into keys.
        SELECT key INTO v_target
          FROM public.workflow_steps
         WHERE workflow_id = v_workflow
           AND position = NULLIF(v_step.config ->> 'on_true', 'next')::int;
        IF v_target IS NOT NULL THEN
          UPDATE public.workflow_steps
             SET next = next || jsonb_build_object('true', v_target)
           WHERE id = v_step.id;
        END IF;

        SELECT key INTO v_target
          FROM public.workflow_steps
         WHERE workflow_id = v_workflow
           AND position = NULLIF(v_step.config ->> 'on_false', 'next')::int;
        IF v_target IS NOT NULL THEN
          UPDATE public.workflow_steps
             SET next = next || jsonb_build_object('false', v_target)
           WHERE id = v_step.id;
        END IF;

        -- A branch with no resolvable target falls through to the next step.
        SELECT key INTO v_target
          FROM public.workflow_steps
         WHERE workflow_id = v_workflow AND position = v_step.position + 1;
        IF v_target IS NOT NULL THEN
          UPDATE public.workflow_steps
             SET next = jsonb_build_object('true', v_target) || next
           WHERE id = v_step.id AND NOT (next ? 'true');
        END IF;
      ELSE
        SELECT key INTO v_target
          FROM public.workflow_steps
         WHERE workflow_id = v_workflow AND position = v_step.position + 1;
        IF v_target IS NOT NULL THEN
          UPDATE public.workflow_steps
             SET next = jsonb_build_object('main', v_target)
           WHERE id = v_step.id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE public.workflow_steps ALTER COLUMN key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workflow_steps_workflow_id_key_key'
  ) THEN
    ALTER TABLE public.workflow_steps
      ADD CONSTRAINT workflow_steps_workflow_id_key_key UNIQUE (workflow_id, key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workflow_steps_key_format'
  ) THEN
    ALTER TABLE public.workflow_steps
      ADD CONSTRAINT workflow_steps_key_format CHECK (key ~ '^[a-z0-9_]{3,48}$');
  END IF;
END;
$$;

COMMENT ON COLUMN public.workflow_steps.key IS
  'Stable per-workflow node id. Edges reference keys, not row ids, because saving re-inserts step rows.';
COMMENT ON COLUMN public.workflow_steps.next IS
  'Outgoing edges as handle -> target key. "main" for ordinary steps; "true"/"false" for conditional_branch.';

-- Triggers are drawn on the canvas too, so they need somewhere to sit. Their
-- coordinates live in the existing config JSONB (config.ui.x / config.ui.y),
-- which needs no schema change.
