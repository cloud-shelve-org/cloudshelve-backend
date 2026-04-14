import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getLargeFiles,
  getOldFiles,
  getTrashFiles,
  emptyTrash,
  bulkDelete,
} from '../controllers/cleanup.controller';

const router = Router();

router.get(   '/:providerId/large',       authMiddleware, getLargeFiles);
router.get(   '/:providerId/old',         authMiddleware, getOldFiles);
router.get(   '/:providerId/trash',       authMiddleware, getTrashFiles);
router.delete('/:providerId/trash',       authMiddleware, emptyTrash);
router.post(  '/:providerId/bulk-delete', authMiddleware, bulkDelete);

export default router;
