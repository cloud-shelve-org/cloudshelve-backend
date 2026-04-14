import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listProviderLargeFiles,
  listProviderOldFiles,
  listProviderTrashFiles,
  emptyProviderTrashFiles,
  bulkDeleteProviderFiles,
} from '../services/files.service';

// ─── Validation schemas ───────────────────────────────────────────────────────

const largeQuerySchema = z.object({
  min_size_mb: z.coerce.number().int().min(1).max(10_000).optional().default(100),
  page_token:  z.string().optional(),
  page_size:   z.coerce.number().int().min(1).max(100).optional().default(50),
});

const oldQuerySchema = z.object({
  days:       z.coerce.number().int().min(30).max(3650).optional().default(365),
  page_token: z.string().optional(),
  page_size:  z.coerce.number().int().min(1).max(100).optional().default(50),
});

const trashQuerySchema = z.object({
  page_token: z.string().optional(),
  page_size:  z.coerce.number().int().min(1).max(100).optional().default(50),
});

const bulkDeleteSchema = z.object({
  file_ids: z.array(z.string().min(1)).min(1).max(200),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** GET /api/cleanup/:providerId/large */
export async function getLargeFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = largeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      return;
    }
    const { min_size_mb, page_token, page_size } = parsed.data;
    const data = await listProviderLargeFiles(
      req.user!.id,
      String(req.params.providerId),
      min_size_mb,
      page_token ?? null,
      page_size,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

/** GET /api/cleanup/:providerId/old */
export async function getOldFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = oldQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      return;
    }
    const { days, page_token, page_size } = parsed.data;
    const data = await listProviderOldFiles(
      req.user!.id,
      String(req.params.providerId),
      days,
      page_token ?? null,
      page_size,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

/** GET /api/cleanup/:providerId/trash */
export async function getTrashFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = trashQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      return;
    }
    const { page_token, page_size } = parsed.data;
    const data = await listProviderTrashFiles(
      req.user!.id,
      String(req.params.providerId),
      page_token ?? null,
      page_size,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

/** DELETE /api/cleanup/:providerId/trash */
export async function emptyTrash(req: Request, res: Response, next: NextFunction) {
  try {
    await emptyProviderTrashFiles(req.user!.id, String(req.params.providerId));
    res.json({ success: true });
  } catch (err) { next(err); }
}

/** POST /api/cleanup/:providerId/bulk-delete  (Pro+ only, enforced in service) */
export async function bulkDelete(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      return;
    }
    const data = await bulkDeleteProviderFiles(
      req.user!.id,
      String(req.params.providerId),
      parsed.data.file_ids,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
