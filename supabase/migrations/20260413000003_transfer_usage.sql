-- ============================================================
-- transfer_usage
-- Tracks cumulative bytes transferred per user per calendar month.
-- One row per (user_id, month) — month is always the 1st day.
-- Written by the BullMQ worker on task completion via
-- the increment_transfer_usage() RPC (atomic upsert).
-- ============================================================

CREATE TABLE public.transfer_usage (
  user_id    UUID    NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  month      DATE    NOT NULL,   -- e.g. '2026-04-01'
  bytes_used BIGINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

CREATE INDEX transfer_usage_user_idx ON public.transfer_usage (user_id);

-- ── Atomic increment (avoids read-modify-write races) ─────────
CREATE OR REPLACE FUNCTION public.increment_transfer_usage(
  p_user_id UUID,
  p_month   DATE,
  p_bytes   BIGINT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.transfer_usage (user_id, month, bytes_used)
  VALUES (p_user_id, p_month, p_bytes)
  ON CONFLICT (user_id, month)
  DO UPDATE SET bytes_used = transfer_usage.bytes_used + EXCLUDED.bytes_used;
END;
$$;

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.transfer_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own monthly usage (for the UI)
CREATE POLICY "transfer_usage: select own"
  ON public.transfer_usage FOR SELECT
  USING (auth.uid() = user_id);

-- All writes go through the service-role key (BullMQ worker + admin)
-- No user-facing INSERT / UPDATE / DELETE policies.
