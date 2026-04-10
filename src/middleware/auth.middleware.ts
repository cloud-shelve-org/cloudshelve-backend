import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './error.middleware';

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    const err: AppError = new Error('Missing or invalid Authorization header');
    err.statusCode = 401;
    return next(err);
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    req.user = {
      id: decoded.sub as string,
      email: decoded.email,
      phone: decoded.phone,
    };
    next();
  } catch {
    const err: AppError = new Error('Invalid or expired token');
    err.statusCode = 401;
    next(err);
  }
}
