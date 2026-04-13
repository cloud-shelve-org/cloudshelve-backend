import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { fileIndexRateLimit } from '../middleware/rate-limit.middleware';
import {
  listFiles,
  searchFiles,
  createFolder,
  deleteFile,
  renameFile,
  uploadFile,
  uploadMiddleware,
  downloadFile,
  indexFiles,
} from '../controllers/files.controller';

const router = Router();

// All file routes require authentication
router.get( '/:providerId',                        authMiddleware, listFiles);
router.get( '/:providerId/search',                 authMiddleware, searchFiles);
router.get( '/:providerId/index',                  authMiddleware, fileIndexRateLimit, indexFiles);
router.post('/:providerId/folder',                 authMiddleware, createFolder);
router.post('/:providerId/upload',                 authMiddleware, uploadMiddleware, uploadFile);
router.get( '/:providerId/:fileId/download',       authMiddleware, downloadFile);
router.delete('/:providerId/:fileId',              authMiddleware, deleteFile);
router.patch('/:providerId/:fileId/rename',        authMiddleware, renameFile);

export default router;
