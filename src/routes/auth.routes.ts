import { Router } from 'express';
import {
  sendPhoneOtp,
  sendEmailOtp,
  verifyPhoneOtp,
  verifyEmailOtp,
  googleAuth,
} from '../controllers/auth.controller';

const router = Router();

router.post('/otp/phone/send', sendPhoneOtp);
router.post('/otp/email/send', sendEmailOtp);
router.post('/otp/phone/verify', verifyPhoneOtp);
router.post('/otp/email/verify', verifyEmailOtp);
router.post('/google', googleAuth);

export default router;
