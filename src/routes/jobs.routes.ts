import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  listJobs,
  createJob,
  toggleJob,
  cancelJob,
  retryJob,
  deleteJob,
  clearJobs,
} from '../controllers/jobs.controller';

const router = Router();

// All job routes require authentication
router.get(   '/',           authMiddleware, listJobs);
router.post(  '/',           authMiddleware, createJob);
router.delete('/',           authMiddleware, clearJobs);
router.patch( '/:id/toggle', authMiddleware, toggleJob);
router.post(  '/:id/cancel', authMiddleware, cancelJob);
router.post(  '/:id/retry',  authMiddleware, retryJob);
router.delete('/:id',        authMiddleware, deleteJob);

export default router;
