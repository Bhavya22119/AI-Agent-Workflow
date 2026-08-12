-- =============================================================================
--  Split "which vendor" from "which wire protocol".
--
--  The first cut of llm_connections stored one column, `provider`, constrained to
--  the three protocols the engine can speak. That is the right model for the
--  engine and the wrong one for a person: nobody picking an endpoint thinks "I
--  want the openai protocol", they think "I want Groq". The picker then offered
--  three options while the shortcut row above it offered nine, which is a UI
--  admitting the schema is wrong.
--
--  So `provider` becomes the vendor — groq, together, ollama, whatever — and
--  `protocol` carries the thing the engine actually dispatches on. Vendors are not
--  enumerated in a CHECK constraint: the list grows every few weeks, and a new
--  OpenAI-compatible host should need a UI entry, not a migration. The format is
--  constrained instead, so the column cannot become a free-text dumping ground.
-- =============================================================================

ALTER TABLE public.llm_connections
  ADD COLUMN IF NOT EXISTS protocol text;

-- The three legacy values were protocol names, so they carry over unchanged.
UPDATE public.llm_connections
   SET protocol = provider
 WHERE protocol IS NULL;

ALTER TABLE public.llm_connections
  ALTER COLUMN protocol SET DEFAULT 'openai';

UPDATE public.llm_connections SET protocol = 'openai' WHERE protocol IS NULL;

ALTER TABLE public.llm_connections
  ALTER COLUMN protocol SET NOT NULL;

DO $$
BEGIN
  -- The old constraint pinned `provider` to the three protocol names.
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'llm_connections_provider_check'
  ) THEN
    ALTER TABLE public.llm_connections DROP CONSTRAINT llm_connections_provider_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'llm_connections_provider_format'
  ) THEN
    ALTER TABLE public.llm_connections
      ADD CONSTRAINT llm_connections_provider_format
        CHECK (provider ~ '^[a-z0-9_]{2,32}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'llm_connections_protocol_check'
  ) THEN
    ALTER TABLE public.llm_connections
      ADD CONSTRAINT llm_connections_protocol_check
        CHECK (protocol IN ('openai', 'anthropic', 'gemini'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.llm_connections.provider IS
  'Vendor id shown to the user (groq, openrouter, ollama, custom, …). Not enumerated in SQL: the list belongs to the UI, and a new OpenAI-compatible host should not need a migration.';
COMMENT ON COLUMN public.llm_connections.protocol IS
  'What the engine dispatches on: openai (/chat/completions), anthropic (/v1/messages) or gemini (:generateContent).';
