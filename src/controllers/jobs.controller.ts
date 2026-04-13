import { Request, Response, NextFunction } from 'express';
import * as jobsService from '../services/jobs.service';
import { createJobSchema } from '../validators/jobs.validator';
import { AppError } from '../middleware/error.middleware';

function badRequest(message: string): AppError {
  const err: AppError = new Error(message);
  err.statusCode = 400;
  return err;
}

/** GET /api/jobs — List all jobs for the authenticated user. */
export async function listJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await jobsService.listJobs(req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** POST /api/jobs — Create a new scheduled job. */
export async function createJob(req: Request, res: Response, next: NextFunction) {
  try {
    const result = createJobSchema.safeParse(req.body);
    if (!result.success) return next(badRequest(result.error.issues[0].message));

    const data = await jobsService.createJob(req.user!.id, result.data);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/jobs/:id/toggle — Toggle a job between active and inactive. */
export async function toggleJob(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await jobsService.toggleJob(req.user!.id, String(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** POST /api/jobs/:id/cancel — Cancel a running or pending job. */
export async function cancelJob(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await jobsService.cancelJob(req.user!.id, String(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/jobs/:id — Permanently delete a job. */
export async function deleteJob(req: Request, res: Response, next: NextFunction) {
  try {
    await jobsService.deleteJob(req.user!.id, String(req.params.id));
    res.json({ success: true, message: 'Job deleted' });
  } catch (err) {
    next(err);
  }
}

/** POST /api/jobs/:id/retry — Re-queue a failed or cancelled job. */
export async function retryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await jobsService.retryJob(req.user!.id, String(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/jobs — Clear completed/failed/cancelled jobs.
 * Requires query: ?filter=completed
 */
export async function clearJobs(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.query.filter !== 'completed') {
      return next(badRequest('filter=completed is required'));
    }
    await jobsService.clearCompletedJobs(req.user!.id);
    res.json({ success: true, message: 'Completed jobs cleared' });
  } catch (err) {
    next(err);
  }
}
