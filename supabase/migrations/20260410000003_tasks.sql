-- ============================================================
-- tasks
-- Async jobs: sync, move, copy, cleanup.
-- Executed by BullMQ workers; status tracked here.
-- ============================================================

CREATE TYPE public.task_type AS ENUM (
  'sync',
  'move',
  'copy',
  'cleanup'
);

CREATE TYPE public.task_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE public.tasks (
  id                 UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID              NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type               public.task_type  NOT NULL,
  status             public.task_status NOT NULL DEFAULT 'pending',
  source_provider_id UUID              REFERENCES public.providers (id) ON DELETE SET NULL,
  target_provider_id UUID              REFERENCES public.providers (id) ON DELETE SET NULL,
  source_path        TEXT,             -- path/prefix within the source provider
  target_path        TEXT,             -- destination path within the target provider
  config             JSONB             NOT NULL DEFAULT '{}', -- extra job parameters
  progress           SMALLINT          NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_message      TEXT,
  bull_job_id        TEXT,             -- BullMQ job id for status polling
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX tasks_user_id_idx        ON public.tasks (user_id);
CREATE INDEX tasks_user_status_idx    ON public.tasks (user_id, status);
CREATE INDEX tasks_source_provider_idx ON public.tasks (source_provider_id) WHERE source_provider_id IS NOT NULL;
CREATE INDEX tasks_target_provider_idx ON public.tasks (target_provider_id) WHERE target_provider_id IS NOT NULL;

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks: select own"
  ON public.tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "tasks: insert own"
  ON public.tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Updates come from the BullMQ worker via service-role key,
-- so there is intentionally no user-facing UPDATE policy.
-- Cancel is a soft-update issued by the API with service-role.

CREATE POLICY "tasks: delete own"
  ON public.tasks FOR DELETE
  USING (auth.uid() = user_id);
