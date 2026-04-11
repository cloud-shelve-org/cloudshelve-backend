import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from './error.middleware';

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    const err: AppError = new Error('Missing or invalid Authorization header');
    err.statusCode = 401;
    return next(err);
  }

  const token = authHeader.slice(7);

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
