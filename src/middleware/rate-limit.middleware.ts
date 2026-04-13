/**
 * Redis sliding-window rate limiter.
 * Fails open on Redis errors (never blocks requests due to cache failure).
 */
import { Request, Response, NextFunction } from 'express';
import { createRedisConnection } from '../config/redis';

const redis = createRedisConnection();

interface RateLimitOpts {
  /** Sliding window size in seconds */
  windowSeconds: number;
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Derive the bucket key from the request */
  keyFn: (req: Request) => string;
  /** Override the 429 error message */
  message?: string;
}

export function rateLimit(opts: RateLimitOpts) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bucketKey = `rl:${opts.keyFn(req)}`;
    const now       = Date.now();
    const windowMs  = opts.windowSeconds * 1000;

    try {
      const pipe = redis.pipeline();
      pipe.zremrangebyscore(bucketKey, '-inf', now - windowMs);
      pipe.zadd(bucketKey, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
      pipe.zcard(bucketKey);
      pipe.expire(bucketKey, opts.windowSeconds + 1);
      const results = await pipe.exec();

      const count = (results?.[2]?.[1] as number) ?? 0;
      const remaining = Math.max(0, opts.maxRequests - count);

      res.setHeader('X-RateLimit-Limit',     opts.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset',     Math.ceil((now + windowMs) / 1000));

      if (count > opts.maxRequests) {
        res.setHeader('Retry-After', opts.windowSeconds);
        res.status(429).json({
          success:    false,
          error:      opts.message ?? 'Too many requests. Please try again later.',
          retryAfter: opts.windowSeconds,
        });
        return;
      }
    } catch {
      // Redis unavailable — fail open
    }

    next();
  };
}

// ─── Pre-configured limiters ──────────────────────────────────────────────────

/** Global: 120 req/min per IP (unauthenticated paths too) */
export const globalRateLimit = rateLimit({
  windowSeconds: 60,
  maxRequests:   120,
  keyFn: (req) => `ip:${req.ip ?? 'unknown'}`,
  message: 'Too many requests from this IP. Please slow down.',
});

/** Authenticated APIs: 120 req/min per user */
export const authRateLimit = rateLimit({
  windowSeconds: 60,
  maxRequests:   120,
  keyFn: (req) => `user:${req.user?.id ?? req.ip ?? 'unknown'}`,
});

/** File index endpoint: 10 calls/min per user (one call per provider per scan) */
export const fileIndexRateLimit = rateLimit({
  windowSeconds: 60,
  maxRequests:   10,
  keyFn: (req) => `idx:${req.user?.id ?? req.ip ?? 'unknown'}`,
  message: 'File indexing rate limit exceeded. Please wait before starting another scan.',
});
