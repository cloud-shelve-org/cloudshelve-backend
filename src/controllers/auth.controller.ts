import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { env } from '../config/env';
import {
  sendPhoneOtpSchema,
  sendEmailOtpSchema,
  verifyPhoneOtpSchema,
  verifyEmailOtpSchema,
  googleAuthSchema,
} from '../validators/auth.validator';
import { AppError } from '../middleware/error.middleware';

const OTP_EXPIRES_IN = 300; // seconds

function signToken(user: User): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email || undefined,
      phone: user.phone || undefined,
    },
    env.JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function formatUser(user: User) {
  return {
    id: user.id,
    name:
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      null,
    email: user.email || null,
    phone: user.phone || null,
    avatar:
      (user.user_metadata?.avatar_url as string | undefined) ||
      (user.user_metadata?.picture as string | undefined) ||
      null,
  };
}

function isNewlyCreated(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  return Date.now() - created < 30_000; // within last 30 seconds
}

function badRequest(message: string): AppError {
  const err: AppError = new Error(message);
  err.statusCode = 400;
  return err;
}

// POST /auth/otp/phone/send
export async function sendPhoneOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = sendPhoneOtpSchema.safeParse(req.body);
    if (!result.success) return next(badRequest(result.error.issues[0].message));

    const { phone } = result.data;
    const { error } = await supabase.auth.signInWithOtp({ phone });

    if (error) {
      const err: AppError = new Error(error.message);
      err.statusCode = error.status || 400;
      return next(err);
    }

    res.json({ message: 'OTP sent successfully', expiresIn: OTP_EXPIRES_IN });
  } catch (err) {
    next(err);
  }
}

// POST /auth/otp/email/send
export async function sendEmailOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = sendEmailOtpSchema.safeParse(req.body);
    if (!result.success) return next(badRequest(result.error.issues[0].message));

    const { email } = result.data;
    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
      const err: AppError = new Error(error.message);
      err.statusCode = error.status || 400;
      return next(err);
    }

    res.json({ message: 'OTP sent successfully', expiresIn: OTP_EXPIRES_IN });
  } catch (err) {
    next(err);
  }
}

// POST /auth/otp/phone/verify
export async function verifyPhoneOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = verifyPhoneOtpSchema.safeParse(req.body);
    if (!result.success) return next(badRequest(result.error.issues[0].message));

    const { phone, otp } = result.data;
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    });

    if (error || !data.user) {
      const err: AppError = new Error(error?.message || 'OTP verification failed');
      err.statusCode = error?.status || 400;
      return next(err);
    }

    const token = signToken(data.user);
    res.json({
      token,
      user: formatUser(data.user),
      isNewUser: isNewlyCreated(data.user.created_at),
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/otp/email/verify
export async function verifyEmailOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = verifyEmailOtpSchema.safeParse(req.body);
    if (!result.success) return next(badRequest(result.error.issues[0].message));

    const { email, otp } = result.data;
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (error || !data.user) {
      const err: AppError = new Error(error?.message || 'OTP verification failed');
      err.statusCode = error?.status || 400;
      return next(err);
    }

    const token = signToken(data.user);
    res.json({
      token,
      user: formatUser(data.user),
      isNewUser: isNewlyCreated(data.user.created_at),
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/google
export async function googleAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const result = googleAuthSchema.safeParse(req.body);
    if (!result.success) return next(badRequest(result.error.issues[0].message));

    const { idToken } = result.data;
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error || !data.user) {
      const err: AppError = new Error(error?.message || 'Google authentication failed');
      err.statusCode = error?.status || 400;
      return next(err);
    }

    const token = signToken(data.user);
    res.json({
      token,
      user: formatUser(data.user),
      isNewUser: isNewlyCreated(data.user.created_at),
    });
  } catch (err) {
    next(err);
  }
}
