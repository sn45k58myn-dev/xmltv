
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key) ?? { count: 0, resetAt: now + env.RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + env.RATE_LIMIT_WINDOW_MS; }
  bucket.count += 1;
  buckets.set(key, bucket);
  res.setHeader('x-rate-limit-limit', String(env.RATE_LIMIT_MAX));
  res.setHeader('x-rate-limit-remaining', String(Math.max(0, env.RATE_LIMIT_MAX - bucket.count)));
  if (bucket.count > env.RATE_LIMIT_MAX) return res.status(429).json({ error: 'Rate limit exceeded' });
  next();
}
