import { supabaseAdmin } from '../config/supabase';

// ─── Tier definitions (mirror of frontend scan.types.ts) ─────────────────────

const TIERS: Record<string, { sizeLabel: string; sizeLimitBytes: number; amountPaise: number }> = {
  tier_50:  { sizeLabel: 'Up to 50 GB',  sizeLimitBytes: 50  * 1024 ** 3, amountPaise: 20000 },
  tier_100: { sizeLabel: 'Up to 100 GB', sizeLimitBytes: 100 * 1024 ** 3, amountPaise: 35000 },
  tier_200: { sizeLabel: 'Up to 200 GB', sizeLimitBytes: 200 * 1024 ** 3, amountPaise: 45000 },
  tier_500: { sizeLabel: 'Up to 500 GB', sizeLimitBytes: 500 * 1024 ** 3, amountPaise: 69900 },
  tier_inf: { sizeLabel: 'Unlimited',    sizeLimitBytes: -1,               amountPaise: 99900 },
};

// ─── Purchase ─────────────────────────────────────────────────────────────────

/**
 * Creates a scan_credit record in 'active' status.
 *
 * In production: call this AFTER verifying payment via Razorpay webhook.
 * Until a payment gateway is wired, we activate immediately on intent.
 * The `paymentId` field stores the gateway reference once integrated.
 */
export async function purchaseScanCredit(
  userId: string,
  tierId: string,
  paymentId?: string,
) {
  const tier = TIERS[tierId];
  if (!tier) {
    const err: any = new Error(`Invalid tier: ${tierId}`);
    err.statusCode = 400;
    throw err;
  }

  // Prevent duplicate active credits for the same tier
  const { data: existing } = await supabaseAdmin
    .from('scan_credits')
    .select('id')
    .eq('user_id', userId)
    .eq('tier_id', tierId)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    const err: any = new Error('You already have an active scan credit for this tier.');
    err.statusCode = 409;
    throw err;
  }

  const { data, error } = await supabaseAdmin
    .from('scan_credits')
    .insert({
      user_id:          userId,
      tier_id:          tierId,
      size_label:       tier.sizeLabel,
      size_limit_bytes: tier.sizeLimitBytes,
      amount_paid:      tier.amountPaise,
      payment_id:       paymentId ?? null,
      payment_gateway:  paymentId ? 'razorpay' : 'manual',
      status:           'active',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// ─── Credit lookup ────────────────────────────────────────────────────────────

export async function getActiveCredits(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('scan_credits')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('purchased_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ─── Consume a credit when scan completes ────────────────────────────────────

export async function consumeScanCredit(creditId: string, userId: string) {
  const { error } = await supabaseAdmin
    .from('scan_credits')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', creditId)
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw error;
}

// ─── Record completed scan stats ─────────────────────────────────────────────

export async function recordScanHistory(
  userId: string,
  mode: 'same-cloud' | 'cross-cloud',
  stats: {
    totalFilesScanned:    number;
    totalSizeScanned:     number;
    duplicateGroupsFound: number;
    potentialSavings:     number;
  },
  scanCreditId?: string,
) {
  const { error } = await supabaseAdmin
    .from('scan_history')
    .insert({
      user_id:                userId,
      mode,
      scan_credit_id:         scanCreditId ?? null,
      total_files_scanned:    stats.totalFilesScanned,
      total_size_scanned:     stats.totalSizeScanned,
      duplicate_groups_found: stats.duplicateGroupsFound,
      potential_savings_bytes:stats.potentialSavings,
    });

  if (error) throw error;
}

// ─── Scan history for the user ────────────────────────────────────────────────

export async function getScanHistory(userId: string, limit = 10) {
  const { data, error } = await supabaseAdmin
    .from('scan_history')
    .select('*')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

// ─── Expire stale credits (called lazily on credit lookup) ───────────────────

export async function expireStaleCredits(userId: string) {
  await supabaseAdmin
    .from('scan_credits')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString());
}
