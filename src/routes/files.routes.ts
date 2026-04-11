import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { listFiles, searchFiles } from '../controllers/files.controller';

const router = Router();

// All file routes require authentication
router.get('/:providerId',        authMiddleware, listFiles);
router.get('/:providerId/search', authMiddleware, searchFiles);

export default router;
