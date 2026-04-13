import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getUsage } from '../controllers/subscriptions.controller';

const router = Router();

router.get('/usage', authMiddleware, getUsage);

export default router;
