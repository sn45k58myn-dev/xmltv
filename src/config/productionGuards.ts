import { env } from './env';

const LOCAL_DATABASE_PATTERNS = [
  /^file:/i,
  /localhost/i,
  /127\.0\.0\.1/
];

export function assertProductionSafeConfig() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN === 'dev-admin-token') {
    throw new Error('Refusing production startup with missing or default ADMIN_TOKEN.');
  }

  if (env.ALLOW_ADMIN_QUERY_TOKEN === 'true') {
    throw new Error('Refusing production startup with ALLOW_ADMIN_QUERY_TOKEN enabled.');
  }

  if (LOCAL_DATABASE_PATTERNS.some((pattern) => pattern.test(env.DATABASE_URL))) {
    throw new Error('Refusing production startup with local or development DATABASE_URL.');
  }

  const redisRequired =
    env.RATE_LIMIT_STORE === 'redis' ||
    env.CACHE_METADATA_STORE === 'redis' ||
    env.JOB_QUEUE_BACKEND === 'bullmq';

  if (redisRequired && !env.REDIS_URL) {
    throw new Error('Refusing production startup with Redis-backed features enabled but REDIS_URL missing.');
  }
}
