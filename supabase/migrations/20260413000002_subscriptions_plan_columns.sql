-- ============================================================
-- subscriptions: add new limit columns and seed correct defaults
-- Runs in a separate transaction so the 'business' enum value
-- added in 20260413000001 is fully committed and safe to use.
-- ============================================================

-- 1. Add new columns (idempotent)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS active_jobs_limit    INTEGER  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS transfer_bytes_limit BIGINT   NOT NULL DEFAULT 5368709120,
  ADD COLUMN IF NOT EXISTS parallel_threads     SMALLINT NOT NULL DEFAULT 1;

-- 2. Free tier (correct providers_limit from 2 → 3)
UPDATE public.subscriptions SET
  providers_limit       = 3,
  active_jobs_limit     = 1,
  transfer_bytes_limit  = 5368709120,    -- 5 GB
  parallel_threads      = 1
WHERE plan = 'free';

-- 3. Pro tier
UPDATE public.subscriptions SET
  providers_limit       = 10,
  active_jobs_limit     = 10,
  transfer_bytes_limit  = 107374182400,  -- 100 GB
  parallel_threads      = 4
WHERE plan = 'pro';

-- 4. Enterprise / business tier (unlimited active jobs)
UPDATE public.subscriptions SET
  providers_limit       = 20,
  active_jobs_limit     = -1,            -- -1 = unlimited
  transfer_bytes_limit  = 1099511627776, -- 1 TB
  parallel_threads      = 8
WHERE plan IN ('enterprise', 'business');
