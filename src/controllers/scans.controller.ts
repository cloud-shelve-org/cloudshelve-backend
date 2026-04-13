import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  purchaseScanCredit,
  getActiveCredits,
  consumeScanCredit,
  recordScanHistory,
  getScanHistory,
  expireStaleCredits,
  checkScanQuota,
  getScanQuota,
} from '../services/scans.service';

// ─── Validation schemas ───────────────────────────────────────────────────────

const purchaseSchema = z.object({
  tier_id:    z.enum(['tier_50', 'tier_100', 'tier_200', 'tier_500', 'tier_inf']),
  payment_id: z.string().optional(),
});

const consumeSchema = z.object({
  credit_id: z.string().uuid(),
});

const historySchema = z.object({
  mode:           z.enum(['same-cloud', 'cross-cloud']),
  scan_credit_id: z.string().uuid().optional(),
  stats: z.object({
    total_files_scanned:    z.number().int().min(0),
    total_size_scanned:     z.number().min(0),
    duplicate_groups_found: z.number().int().min(0),
    potential_savings:      z.number().min(0),
  }),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * POST /api/scans/credits/purchase
 *
 * Creates an active scan credit for the authenticated user.
 * In production: call only AFTER verifying payment via Razorpay webhook.
 * For now we activate on intent (no gateway yet).
 */
export async function purchaseCredit(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      return;
    }
    const { tier_id, payment_id } = parsed.data;
    const data = await purchaseScanCredit(req.user!.id, tier_id, payment_id);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    next(err);
  }
}

/**
 * GET /api/scans/credits
 *
 * Returns all active, non-expired scan credits for the user.
 * Also lazily expires stale credits before returning.
 */
export async function listCredits(req: Request, res: Response, next: NextFunction) {
  try {
    await expireStaleCredits(req.user!.id);
    const data = await getActiveCredits(req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/scans/credits/consume
 *
 * Marks a scan credit as 'used'. Called by the mobile client immediately
 * after a successful cross-cloud scan completes.
 */
export async function useCredit(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = consumeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      return;
    }
    await consumeScanCredit(parsed.data.credit_id, req.user!.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/scans/history
 *
 * Records aggregate stats from a completed scan.
 * Privacy: only totals are stored — no file names, paths, or content.
 */
export async function createHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = historySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      return;
    }
    const { mode, scan_credit_id, stats } = parsed.data;

    // Enforce plan quota before recording (also prevents abusive POSTs)
    await checkScanQuota(req.user!.id, mode);

    const id = await recordScanHistory(
      req.user!.id,
      mode,
      {
        totalFilesScanned:    stats.total_files_scanned,
        totalSizeScanned:     stats.total_size_scanned,
        duplicateGroupsFound: stats.duplicate_groups_found,
        potentialSavings:     stats.potential_savings,
      },
      scan_credit_id,
    );
    res.status(201).json({ success: true, data: { id } });
  } catch (err: any) {
    next(err);
  }
}

/**
 * GET /api/scans/history?limit=10
 *
 * Returns the user's recent scan history (aggregate stats only).
 */
export async function listHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = historyQuerySchema.safeParse(req.query);
    const limit = parsed.success ? parsed.data.limit : 10;
    const data = await getScanHistory(req.user!.id, limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/scans/quota
 * Returns the current user's scan quota usage and limits.
 */
export async function getQuota(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getScanQuota(req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
