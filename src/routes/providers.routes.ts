import { Router } from 'express';
import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  listProviders,
  getProviderDetail,
  getOAuthUrl,
  connectProvider,
  disconnectProvider,
  syncProvider,
  authFormPage,
  authFormSubmit,
} from '../controllers/providers.controller';

const router = Router();

// ── Public routes (credential form served in an in-app browser) ──────────────
router.get('/auth-form', authFormPage);
router.post(
  '/auth-form',
  express.urlencoded({ extended: true }),
  authFormSubmit,
);

// ── Protected routes ─────────────────────────────────────────────────────────
// Static paths MUST be registered before the /:id wildcard to avoid conflicts.
router.get('/', authMiddleware, listProviders);
router.get('/oauth-url', authMiddleware, getOAuthUrl);
router.post('/connect', authMiddleware, connectProvider);

router.get('/:id', authMiddleware, getProviderDetail);
router.post('/:id/sync', authMiddleware, syncProvider);
router.delete('/:id', authMiddleware, disconnectProvider);

export default router;
