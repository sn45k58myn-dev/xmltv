import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env';

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;

export async function getRedisClient() {
  if (env.RATE_LIMIT_STORE !== 'redis' || !env.REDIS_URL) {
    return null;
  }

  if (client?.isOpen) {
    return client;
  }

  if (connecting) {
    return connecting;
  }

  connecting = (async () => {
    const redis = createClient({
      url: env.REDIS_URL
    });

    redis.on('error', (error) => {
      console.error('Redis client error:', error);
    });

    await redis.connect();
    client = redis as RedisClientType;

    return client;
  })().catch((error) => {
    console.error('Unable to connect to Redis, falling back to in-memory rate limiting:', error);
    return null;
  }).finally(() => {
    connecting = null;
  });

  return connecting;
}

export async function closeRedisClient() {
  if (client?.isOpen) {
    await client.quit();
  }

  client = null;
}
