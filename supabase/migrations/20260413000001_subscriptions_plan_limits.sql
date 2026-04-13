-- ============================================================
-- subscriptions: add plan limit columns + business tier
-- Adds active_jobs_limit, transfer_bytes_limit, parallel_threads.
-- NOTE: 'business' enum value is added here but cannot be used in
-- the same transaction — existing row updates are in the next migration.
-- ============================================================

-- 1. Extend the plan enum with 'business' tier
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'business';
