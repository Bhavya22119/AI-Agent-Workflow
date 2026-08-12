-- =============================================================================
--  llm_connections — bring-your-own LLM endpoints, per organization.
--
--  An `llm_call` step can either use the server's configured provider or point at
--  a connection stored here: an API protocol, a base URL, an API key and a
--  default model. That is what makes "use my own model" possible without handing
--  every tenant the server's key.
--
--  Why the key lives in its own table instead of in workflow_steps.config
--  ---------------------------------------------------------------------------
--  Every member of an organization — including a viewer — can read
--  workflow_steps.config, because that is the workflow definition. An API key
--  pasted into a step's config would therefore be readable by every viewer in
--  the org, and would travel in every workflow export. Here it is a column with
--  no select permission at all: writable by owners, readable only by the engine
--  through the admin secret. Same pattern as workflow_triggers.secret.
--
--  `provider` names the wire protocol, not the vendor, because one protocol
--  covers many vendors:
--    openai     — /chat/completions. OpenAI, Groq, OpenRouter, Together,
--                 Fireworks, DeepSeek, vLLM, Ollama, LM Studio, …
--    anthropic  — /v1/messages
--    gemini     — :generateContent
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.llm_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,

  -- What the picker in an llm_call node shows.
  name          text NOT NULL
                  CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),

  provider      text NOT NULL
                  CHECK (provider IN ('openai', 'anthropic', 'gemini')),

  -- Blank means "the vendor default for this protocol". A value here is what
  -- makes a self-hosted or third-party endpoint work.
  base_url      text
                  CHECK (base_url IS NULL OR base_url ~* '^https?://'),

  default_model text,

  -- Never in any select permission. The engine reads it with the admin secret.
  api_key       text NOT NULL CHECK (char_length(api_key) >= 8),

  created_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Steps reference a connection by id, but a person picks it by name, so the
  -- name has to be unambiguous inside an organization.
  CONSTRAINT llm_connections_org_id_name_key UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_llm_connections_org ON public.llm_connections (org_id);

DROP TRIGGER IF EXISTS set_llm_connections_updated_at ON public.llm_connections;
CREATE TRIGGER set_llm_connections_updated_at
  BEFORE UPDATE ON public.llm_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.llm_connections IS
  'Per-organization LLM endpoints. api_key has no select permission for any role: owners write it, the engine reads it with the admin secret.';
COMMENT ON COLUMN public.llm_connections.provider IS
  'Wire protocol: openai (/chat/completions), anthropic (/v1/messages) or gemini (:generateContent).';
COMMENT ON COLUMN public.llm_connections.api_key IS
  'Write-only through the API. Excluded from every select permission, so it cannot be read back even by the owner who set it.';
