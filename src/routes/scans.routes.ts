import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  purchaseCredit,
  listCredits,
  useCredit,
  createHistory,
  listHistory,
} from '../controllers/scans.controller';

const router = Router();

// All scan routes require authentication
router.get( '/credits',          authMiddleware, listCredits);
router.post('/credits/purchase', authMiddleware, purchaseCredit);
router.post('/credits/consume',  authMiddleware, useCredit);
router.post('/history',          authMiddleware, createHistory);
router.get( '/history',          authMiddleware, listHistory);

export default router;
