-- ============================================================
-- Update providers table for API contract alignment
-- - Change type column from enum to TEXT for flexibility
-- - Add email and display_name columns
-- ============================================================

ALTER TABLE public.providers ALTER COLUMN type TYPE TEXT USING type::TEXT;

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS display_name TEXT;
