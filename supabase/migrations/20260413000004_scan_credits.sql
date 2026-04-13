-- ─── Scan credits (purchased cross-cloud duplicate scans) ────────────────────
--
-- A scan credit is purchased once by the user before running a cross-cloud
-- duplicate scan. The credit records the tier they paid for (size limit) and
-- whether it has been consumed.  Same-cloud scanning is free for Pro users and
-- never creates a credit record.

CREATE TABLE IF NOT EXISTS public.scan_credits (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pricing tier
  tier_id          TEXT        NOT NULL,                  -- 'tier_50' | 'tier_100' | 'tier_200' | 'tier_500' | 'tier_inf'
  size_label       TEXT        NOT NULL,                  -- human-readable e.g. 'Up to 100 GB'
  size_limit_bytes BIGINT      NOT NULL,                  -- -1 means unlimited
  amount_paid      INTEGER     NOT NULL,                  -- in INR paise (₹200 → 20000)

  -- Payment gateway reference (Razorpay etc.) — nullable until wired up
  payment_id       TEXT,
  payment_gateway  TEXT        DEFAULT 'manual',

  -- Lifecycle
  status           TEXT        NOT NULL DEFAULT 'active'  -- 'active' | 'used' | 'expired'
                   CHECK (status IN ('active', 'used', 'expired')),
  purchased_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at          TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Scan history (summary of each completed scan) ────────────────────────────
--
-- We store only aggregate statistics, never individual file names or paths.
-- This keeps the table lean and preserves user privacy.

CREATE TABLE IF NOT EXISTS public.scan_history (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode                    TEXT        NOT NULL CHECK (mode IN ('same-cloud', 'cross-cloud')),
  scan_credit_id          UUID        REFERENCES public.scan_credits(id),

  -- Aggregate stats only (no file names/paths stored on server)
  total_files_scanned     INTEGER     NOT NULL DEFAULT 0,
  total_size_scanned      BIGINT      NOT NULL DEFAULT 0,  -- bytes
  duplicate_groups_found  INTEGER     NOT NULL DEFAULT 0,
  potential_savings_bytes BIGINT      NOT NULL DEFAULT 0,

  completed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS scan_credits_user_id_idx   ON public.scan_credits (user_id);
CREATE INDEX IF NOT EXISTS scan_credits_status_idx    ON public.scan_credits (status);
CREATE INDEX IF NOT EXISTS scan_history_user_id_idx   ON public.scan_history (user_id);

-- ─── Row-level security ───────────────────────────────────────────────────────

ALTER TABLE public.scan_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own scan credits"
  ON public.scan_credits FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage their own scan history"
  ON public.scan_history FOR ALL
  USING (auth.uid() = user_id);
