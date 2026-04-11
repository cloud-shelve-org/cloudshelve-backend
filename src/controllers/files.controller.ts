import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import {
  listProviderFiles,
  searchProviderFiles,
  createProviderFolder,
  deleteProviderFile,
  renameProviderFile,
  uploadProviderFile,
} from '../services/files.service';

// ─── Multer: in-memory storage, 50 MB limit ───────────────────────────────────

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
}).single('file');

// ─── Validation schemas ───────────────────────────────────────────────────────

const listQuerySchema = z.object({
  folder_id:  z.string().optional(),
  page_token: z.string().optional(),
  page_size:  z.coerce.number().int().min(1).max(200).optional(),
});

const searchQuerySchema = z.object({
  q:          z.string().min(1, 'q is required'),
  page_token: z.string().optional(),
  page_size:  z.coerce.number().int().min(1).max(200).optional(),
});

const createFolderSchema = z.object({
  name:      z.string().min(1).max(255),
  parent_id: z.string().optional().nullable(),
});

const renameSchema = z.object({
  name: z.string().min(1).max(255),
  path: z.string().optional().nullable(),
});

const deleteQuerySchema = z.object({
  path: z.string().optional(),
});

const uploadQuerySchema = z.object({
  parent_id: z.string().optional().nullable(),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** GET /api/files/:providerId */
export async function listFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0].message }); return; }
    const { folder_id, page_token, page_size } = parsed.data;
    const data = await listProviderFiles(req.user!.id, String(req.params.providerId), folder_id ?? null, page_token ?? null, page_size);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

/** GET /api/files/:providerId/search */
export async function searchFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0].message }); return; }
    const { q, page_token, page_size } = parsed.data;
    const data = await searchProviderFiles(req.user!.id, String(req.params.providerId), q, page_token ?? null, page_size);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

/** POST /api/files/:providerId/folder */
export async function createFolder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createFolderSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0].message }); return; }
    const { name, parent_id } = parsed.data;
    const data = await createProviderFolder(req.user!.id, String(req.params.providerId), parent_id ?? null, name);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

/** DELETE /api/files/:providerId/:fileId */
export async function deleteFile(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = deleteQuerySchema.safeParse(req.query);
    const filePath = parsed.success ? parsed.data.path : undefined;
    await deleteProviderFile(req.user!.id, String(req.params.providerId), String(req.params.fileId), filePath);
    res.status(204).send();
  } catch (err) { next(err); }
}

/** PATCH /api/files/:providerId/:fileId/rename */
export async function renameFile(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0].message }); return; }
    const { name, path } = parsed.data;
    const data = await renameProviderFile(req.user!.id, String(req.params.providerId), String(req.params.fileId), name, path);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

/** POST /api/files/:providerId/upload  (multipart/form-data, field: "file") */
export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) { res.status(400).json({ success: false, error: 'No file provided' }); return; }
    const parsed = uploadQuerySchema.safeParse(req.query);
    const parentId = parsed.success ? (parsed.data.parent_id ?? null) : null;
    const { originalname, mimetype, buffer } = req.file;
    const data = await uploadProviderFile(req.user!.id, String(req.params.providerId), parentId, originalname, mimetype, buffer);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}
