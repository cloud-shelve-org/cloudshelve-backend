-- ============================================================
-- providers
-- Connected cloud storage accounts per user.
-- credentials stores OAuth tokens / API keys (encrypt at app layer).
-- ============================================================

CREATE TYPE public.provider_type AS ENUM (
  'gdrive',
  'onedrive',
  'dropbox',
  'mega',
  's3'
);

CREATE TABLE public.providers (
  id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID              NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type             public.provider_type NOT NULL,
  label            TEXT              NOT NULL,            -- user-given nickname
  credentials      JSONB             NOT NULL DEFAULT '{}', -- OAuth tokens / API keys
  storage_used     BIGINT            NOT NULL DEFAULT 0,  -- bytes
  storage_total    BIGINT,                                -- bytes, NULL = unknown/unlimited
  is_active        BOOLEAN           NOT NULL DEFAULT TRUE,
  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX providers_user_id_idx ON public.providers (user_id);
CREATE INDEX providers_user_type_idx ON public.providers (user_id, type);

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER providers_set_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers: select own"
  ON public.providers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "providers: insert own"
  ON public.providers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "providers: update own"
  ON public.providers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "providers: delete own"
  ON public.providers FOR DELETE
  USING (auth.uid() = user_id);
