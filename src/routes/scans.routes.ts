import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { authRateLimit } from '../middleware/rate-limit.middleware';
import {
  purchaseCredit, listCredits, useCredit,
  createHistory, listHistory, getQuota,
} from '../controllers/scans.controller';

const router = Router();

// All scan routes: require auth + per-user rate limit
router.use(authMiddleware, authRateLimit);

router.get( '/quota',            getQuota);
router.get( '/credits',          listCredits);
router.post('/credits/purchase', purchaseCredit);
router.post('/credits/consume',  useCredit);
router.post('/history',          createHistory);
router.get( '/history',          listHistory);

export default router;
