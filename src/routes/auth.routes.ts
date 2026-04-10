import { Router } from 'express';
import {
  sendPhoneOtp,
  sendEmailOtp,
  verifyPhoneOtp,
  verifyEmailOtp,
  googleAuth,
  deleteAccount,
} from '../controllers/auth.controller';
import { confirmPage } from '../controllers/confirm.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/confirm', confirmPage);
router.post('/otp/phone/send', sendPhoneOtp);
router.post('/otp/email/send', sendEmailOtp);
router.post('/otp/phone/verify', verifyPhoneOtp);
router.post('/otp/email/verify', verifyEmailOtp);
router.post('/google', googleAuth);
router.delete('/account', authMiddleware, deleteAccount);

export default router;
