import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { getRedisClient } from '../services/redisClient';

type ExportTokenScope = {
  profileId: string | null;
  providerId: string | null;
};
type ProfileLimitBucket = {
  count: number;
  resetAt: number;
};
const profileLimitBuckets = new Map<string, ProfileLimitBucket>();
let profileLimitRequestsSincePrune = 0;
const PROFILE_LIMIT_PRUNE_INTERVAL = 100;

function routeScope(req: Request): ExportTokenScope {
  if (typeof req.params.id === 'string' && req.path.startsWith('/profile/')) {
    return {
      profileId: req.params.id,
      providerId: null
    };
  }

  if (typeof req.params.id === 'string' && req.path.startsWith('/provider/')) {
    return {
      profileId: null,
      providerId: req.params.id
    };
  }

  return {
    profileId: null,
    providerId: null
  };
}

function tokenAllowedForRoute(
  token: ExportTokenScope,
  route: ExportTokenScope
) {
  if (token.profileId && token.profileId !== route.profileId) {
    return false;
  }

  if (token.providerId && token.providerId !== route.providerId) {
    return false;
  }

  return true;
}

function profileLimitKey(
  tokenId: string,
  profileId: string
) {
  return `${tokenId}:${profileId}`;
}

function setProfileRateLimitHeaders(
  res: Response,
  limit: number,
  count: number,
  resetAt: number
) {
  res.setHeader('x-profile-rate-limit-limit', String(limit));
  res.setHeader('x-profile-rate-limit-remaining', String(Math.max(0, limit - count)));
  res.setHeader('x-profile-rate-limit-reset', new Date(resetAt).toISOString());
}

function sendProfileRateLimitExceeded(
  res: Response,
  resetAt: number
) {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt - Date.now()) / 1000)
  );

  res.setHeader('retry-after', String(retryAfterSeconds));

  return res.status(429).json({
    error: 'Profile export rate limit exceeded',
    retryAfterSeconds
  });
}

function pruneExpiredProfileLimitBuckets(now: number) {
  for (const [
    key,
    bucket
  ] of profileLimitBuckets.entries()) {
    if (now > bucket.resetAt) {
      profileLimitBuckets.delete(key);
    }
  }
}

async function checkMemoryProfileRateLimit(
  key: string,
  limit: number,
  res: Response
) {
  const now = Date.now();
  profileLimitRequestsSincePrune += 1;

  if (profileLimitRequestsSincePrune >= PROFILE_LIMIT_PRUNE_INTERVAL) {
    profileLimitRequestsSincePrune = 0;
    pruneExpiredProfileLimitBuckets(now);
  }

  const bucket = profileLimitBuckets.get(key) ?? {
    count: 0,
    resetAt: now + env.RATE_LIMIT_WINDOW_MS
  };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + env.RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  profileLimitBuckets.set(key, bucket);
  setProfileRateLimitHeaders(
    res,
    limit,
    bucket.count,
    bucket.resetAt
  );

  if (bucket.count > limit) {
    sendProfileRateLimitExceeded(res, bucket.resetAt);
    return false;
  }

  return true;
}

async function checkRedisProfileRateLimit(
  key: string,
  limit: number,
  res: Response
) {
  const redis = await getRedisClient();

  if (!redis) {
    return checkMemoryProfileRateLimit(
      key,
      limit,
      res
    );
  }

  const redisKey = `profile-export-rate-limit:${key}`;
  const count = await redis.incr(redisKey);
  const resetAt = Date.now() + env.RATE_LIMIT_WINDOW_MS;

  if (count === 1) {
    await redis.pExpire(
      redisKey,
      env.RATE_LIMIT_WINDOW_MS
    );
  }

  setProfileRateLimitHeaders(
    res,
    limit,
    count,
    resetAt
  );

  if (count > limit) {
    sendProfileRateLimitExceeded(res, resetAt);
    return false;
  }

  return true;
}

async function checkProfileRateLimit(
  tokenId: string,
  profileId: string,
  res: Response
) {
  const profile = await prisma.exportProfile.findUnique({
    where: {
      id: profileId
    },
    select: {
      rateLimit: true
    }
  });
  const limit = profile?.rateLimit;

  if (!limit) {
    return true;
  }

  const key = profileLimitKey(
    tokenId,
    profileId
  );

  if (env.RATE_LIMIT_STORE === 'redis') {
    return checkRedisProfileRateLimit(
      key,
      limit,
      res
    );
  }

  return checkMemoryProfileRateLimit(
    key,
    limit,
    res
  );
}

export async function requireExportToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (env.PUBLIC_EXPORTS === 'true') {
    return next();
  }

  const queryToken = Array.isArray(req.query.token)
    ? req.query.token[0]
    : req.query.token;
  const headerToken = req.header('x-export-token');
  const token = String(headerToken ?? queryToken ?? '').trim();

  if (!token) {
    return res.status(401).json({
      error: 'Export token required. Pass ?token=<token> or x-export-token header.'
    });
  }

  const exportToken = await prisma.exportToken.findUnique({
    where: {
      token
    }
  });

  if (!exportToken?.active) {
    return res.status(401).json({
      error: 'Invalid or inactive export token.'
    });
  }

  if (!tokenAllowedForRoute(
    exportToken,
    routeScope(req)
  )) {
    return res.status(403).json({
      error: 'Export token is not allowed for this feed.'
    });
  }

  if (exportToken.profileId) {
    const allowed = await checkProfileRateLimit(
      exportToken.id,
      exportToken.profileId,
      res
    );

    if (!allowed) {
      return;
    }
  }

  const updated = await prisma.exportToken.updateMany({
    where: {
      id: exportToken.id,
      active: true
    },
    data: {
      requests: {
        increment: 1
      },
      lastUsedAt: new Date()
    }
  });

  if (updated.count !== 1) {
    return res.status(401).json({
      error: 'Invalid or inactive export token.'
    });
  }

  return next();
}

export function profileRateLimitBucketCount() {
  return profileLimitBuckets.size;
}
