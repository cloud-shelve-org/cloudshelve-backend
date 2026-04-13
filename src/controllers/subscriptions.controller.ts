import { Request, Response, NextFunction } from 'express';
import { getUsageSummary } from '../services/subscriptions.service';

/** GET /api/subscriptions/usage — Returns the user's plan and current month's transfer usage. */
export async function getUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await getUsageSummary(req.user!.id);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
}
