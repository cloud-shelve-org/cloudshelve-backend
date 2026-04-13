import { supabaseAdmin } from '../config/supabase';
import { PLAN_LIMITS, type PlanName, type PlanLimits } from '../config/plans';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthStr(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(1)} KB`;
}

// ─── Plan lookup ──────────────────────────────────────────────────────────────

export async function getUserPlan(userId: string): Promise<PlanName> {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle();

  const plan = (data?.plan ?? 'free') as string;
  return (plan in PLAN_LIMITS ? plan : 'free') as PlanName;
}

export async function getUserLimits(userId: string): Promise<PlanLimits> {
  const plan = await getUserPlan(userId);
  return PLAN_LIMITS[plan];
}

// ─── Transfer usage ───────────────────────────────────────────────────────────

/** Returns bytes transferred by this user in the current calendar month. */
export async function getMonthlyTransferUsage(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('transfer_usage')
    .select('bytes_used')
    .eq('user_id', userId)
    .eq('month', currentMonthStr())
    .maybeSingle();

  return (data?.bytes_used as number) ?? 0;
}

/**
 * Atomically adds bytes to the current month's usage counter.
 * Uses the increment_transfer_usage() RPC to avoid read-modify-write races
 * when multiple tasks complete concurrently for the same user.
 */
export async function recordTransferUsage(userId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  await supabaseAdmin.rpc('increment_transfer_usage', {
    p_user_id: userId,
    p_month:   currentMonthStr(),
    p_bytes:   bytes,
  });
}

/**
 * Throws HTTP 403 if this user has already hit their monthly transfer cap.
 * Called at the start of each task run — doesn't attempt to predict the
 * job's total size, just blocks if the meter is already maxed.
 */
export async function checkTransferLimit(userId: string): Promise<void> {
  const limits = await getUserLimits(userId);
  if (limits.transferBytes === -1) return;

  const used = await getMonthlyTransferUsage(userId);
  if (used >= limits.transferBytes) {
    const err: any = new Error(
      `You have used your full ${formatBytes(limits.transferBytes)} monthly transfer allowance. ` +
      `Upgrade your plan or wait until next month.`,
    );
    err.statusCode = 403;
    throw err;
  }
}

// ─── Provider limit ───────────────────────────────────────────────────────────

export async function checkProviderLimit(userId: string): Promise<void> {
  const limits = await getUserLimits(userId);
  if (limits.providers === -1) return;

  const { count } = await supabaseAdmin
    .from('providers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);

  if ((count ?? 0) >= limits.providers) {
    const err: any = new Error(
      `Your plan allows up to ${limits.providers} connected provider${limits.providers === 1 ? '' : 's'}. ` +
      `Upgrade your plan to connect more.`,
    );
    err.statusCode = 403;
    throw err;
  }
}

// ─── Active job limit ─────────────────────────────────────────────────────────

export async function checkActiveJobLimit(userId: string): Promise<void> {
  const limits = await getUserLimits(userId);
  if (limits.activeJobs === -1) return;

  const { count: runningCount } = await supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'running');

  const { data: pendingRows } = await supabaseAdmin
    .from('tasks')
    .select('config')
    .eq('user_id', userId)
    .eq('status', 'pending');

  const activeCount =
    (runningCount ?? 0) +
    (pendingRows ?? []).filter((r) => r.config?.is_active === true).length;

  if (activeCount >= limits.activeJobs) {
    const err: any = new Error(
      `Your plan allows up to ${limits.activeJobs} active job${limits.activeJobs === 1 ? '' : 's'} at a time. ` +
      `Disable or delete an existing job, or upgrade your plan.`,
    );
    err.statusCode = 403;
    throw err;
  }
}

// ─── Usage summary (for the API response) ────────────────────────────────────

export interface UsageSummary {
  plan:                  PlanName;
  monthlyTransferUsed:   number;   // bytes
  monthlyTransferLimit:  number;   // bytes (-1 = unlimited)
  transferResetDate:     string;   // ISO date of the first day of next month
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const [plan, monthlyTransferUsed] = await Promise.all([
    getUserPlan(userId),
    getMonthlyTransferUsage(userId),
  ]);

  const limits = PLAN_LIMITS[plan];

  const now   = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    plan,
    monthlyTransferUsed,
    monthlyTransferLimit: limits.transferBytes,
    transferResetDate:    reset.toISOString().slice(0, 10),
  };
}
