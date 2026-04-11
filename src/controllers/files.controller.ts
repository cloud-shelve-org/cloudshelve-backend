import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { listProviderFiles, searchProviderFiles } from '../services/files.service';

const listQuerySchema = z.object({
  folder_id:   z.string().optional(),
  page_token:  z.string().optional(),
  page_size:   z.coerce.number().int().min(1).max(200).optional(),
});

const searchQuerySchema = z.object({
  q:           z.string().min(1, 'q is required'),
  page_token:  z.string().optional(),
  page_size:   z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * GET /api/files/:providerId
 * List files/folders inside a provider, optionally scoped to a folder.
 */
export async function listFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const err: any = new Error(parsed.error.issues[0].message);
      err.statusCode = 400;
      return next(err);
    }

    const { folder_id, page_token, page_size } = parsed.data;
    const data = await listProviderFiles(
      req.user!.id,
      req.params.providerId,
      folder_id ?? null,
      page_token ?? null,
      page_size,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files/:providerId/search
 * Full-text file search within a provider.
 */
export async function searchFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const err: any = new Error(parsed.error.issues[0].message);
      err.statusCode = 400;
      return next(err);
    }

    const { q, page_token, page_size } = parsed.data;
    const data = await searchProviderFiles(
      req.user!.id,
      req.params.providerId,
      q,
      page_token ?? null,
      page_size,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
