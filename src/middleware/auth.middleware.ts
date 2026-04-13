import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from './error.middleware';

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // Also accept token via query param for browser-opened URLs (e.g. file preview via WebBrowser)
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;

  if (!authHeader?.startsWith('Bearer ') && !queryToken) {
    const err: AppError = new Error('Missing or invalid Authorization header');
    err.statusCode = 401;
    return next(err);
  }

  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken!;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    const err: AppError = new Error('Invalid or expired token');
    err.statusCode = 401;
    return next(err);
  }

  req.user = {
    id: data.user.id,
    email: data.user.email,
    phone: data.user.phone,
  };

  next();
}
