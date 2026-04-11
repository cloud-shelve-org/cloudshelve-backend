import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  listFiles,
  searchFiles,
  createFolder,
  deleteFile,
  renameFile,
  uploadFile,
  uploadMiddleware,
} from '../controllers/files.controller';

const router = Router();

// All file routes require authentication
router.get( '/:providerId',                authMiddleware, listFiles);
router.get( '/:providerId/search',         authMiddleware, searchFiles);
router.post('/:providerId/folder',         authMiddleware, createFolder);
router.post('/:providerId/upload',         authMiddleware, uploadMiddleware, uploadFile);
router.delete('/:providerId/:fileId',      authMiddleware, deleteFile);
router.patch('/:providerId/:fileId/rename',authMiddleware, renameFile);

export default router;
