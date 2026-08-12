ALTER TABLE public.workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_steps_key_format,
  DROP CONSTRAINT IF EXISTS workflow_steps_workflow_id_key_key;

ALTER TABLE public.workflow_steps
  DROP COLUMN IF EXISTS canvas_y,
  DROP COLUMN IF EXISTS canvas_x,
  DROP COLUMN IF EXISTS next,
  DROP COLUMN IF EXISTS key;
