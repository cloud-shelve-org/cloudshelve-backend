import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Anon client — for user-facing auth operations (signInWithOtp, verifyOtp, signInWithIdToken)
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Service-role client — for privileged operations (admin user lookups, bypassing RLS)
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
