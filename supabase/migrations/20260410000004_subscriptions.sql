-- ============================================================
-- subscriptions
-- One row per user. Tracks plan, limits, and expiry.
-- ============================================================

CREATE TYPE public.subscription_plan AS ENUM (
  'free',
  'pro',
  'enterprise'
);

CREATE TYPE public.subscription_status AS ENUM (
  'active',
  'cancelled',
  'expired'
);

CREATE TABLE public.subscriptions (
  id                UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID                      NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  plan              public.subscription_plan  NOT NULL DEFAULT 'free',
  status            public.subscription_status NOT NULL DEFAULT 'active',
  -- Soft limits enforced at the API layer
  storage_limit     BIGINT                    NOT NULL DEFAULT 5368709120,  -- 5 GB (free tier)
  tasks_per_month   INTEGER                   NOT NULL DEFAULT 10,
  providers_limit   INTEGER                   NOT NULL DEFAULT 2,
  -- Billing / expiry
  expires_at        TIMESTAMPTZ,              -- NULL = no expiry (free / lifetime)
  created_at        TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX subscriptions_user_id_idx ON public.subscriptions (user_id);

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Auto-create free subscription on new user ─────────────────
CREATE OR REPLACE FUNCTION public.handle_new_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_subscription();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
CREATE POLICY "subscriptions: select own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Mutations are service-role only (billing webhooks, admin upgrades)
-- No INSERT / UPDATE / DELETE policies for authenticated users.
