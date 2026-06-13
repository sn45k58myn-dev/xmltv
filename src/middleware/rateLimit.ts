
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { getRedisClient } from '../services/redisClient';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function rateLimitKey(req: Request) {
  return req.ip || 'unknown';
}

function setRateLimitHeaders(
  res: Response,
  count: number
) {
  res.setHeader('x-rate-limit-limit', String(env.RATE_LIMIT_MAX));
  res.setHeader('x-rate-limit-remaining', String(Math.max(0, env.RATE_LIMIT_MAX - count)));
}

function memoryRateLimit(
  key: string,
  res: Response,
  next: NextFunction
) {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { count: 0, resetAt: now + env.RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + env.RATE_LIMIT_WINDOW_MS; }
  bucket.count += 1;
  buckets.set(key, bucket);
  setRateLimitHeaders(res, bucket.count);
  if (bucket.count > env.RATE_LIMIT_MAX) return res.status(429).json({ error: 'Rate limit exceeded' });
  next();
}

async function redisRateLimit(
  key: string,
  res: Response,
  next: NextFunction
) {
  const redis = await getRedisClient();

  if (!redis) {
    return memoryRateLimit(key, res, next);
  }

  const redisKey = `rate-limit:${key}`;
  const count = await redis.incr(redisKey);

  if (count === 1) {
    await redis.pExpire(redisKey, env.RATE_LIMIT_WINDOW_MS);
  }

  setRateLimitHeaders(res, count);

  if (count > env.RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: 'Rate limit exceeded'
    });
  }

  return next();
}

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = rateLimitKey(req);

  if (env.RATE_LIMIT_STORE === 'redis') {
    void redisRateLimit(key, res, next).catch((error) => {
      console.error('Redis rate limiter failed, falling back to in-memory limiter:', error);
      memoryRateLimit(key, res, next);
    });
    return;
  }

  memoryRateLimit(key, res, next);
}
