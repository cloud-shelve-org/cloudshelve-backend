import { z } from 'zod';

export const sendPhoneOtpSchema = z.object({
  phone: z.string().min(10, 'Invalid phone number'),
});

export const sendEmailOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const verifyPhoneOtpSchema = z.object({
  phone: z.string().min(10, 'Invalid phone number'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const verifyEmailOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
});
