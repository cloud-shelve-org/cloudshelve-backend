import { Router } from 'express';
import { getTerms, getPrivacy } from '../controllers/legal.controller';

const router = Router();

router.get('/terms', getTerms);
router.get('/privacy', getPrivacy);

export default router;
