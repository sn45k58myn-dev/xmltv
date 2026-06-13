import { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = {
  incr: vi.fn(),
  pExpire: vi.fn()
};

vi.mock('../services/redisClient', () => ({
  getRedisClient: vi.fn()
}));

function responseMock() {
  return {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  } as unknown as Response;
}

function requestMock(ip = '127.0.0.1') {
  return {
    ip
  } as Request;
}

async function loadRateLimiter(env: Record<string, string>) {
  vi.resetModules();
  Object.assign(process.env, env);

  return import('./rateLimit');
}

describe('rateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RATE_LIMIT_STORE;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('limits requests with the in-memory store', async () => {
    const { rateLimit } = await loadRateLimiter({
      RATE_LIMIT_STORE: 'memory',
      RATE_LIMIT_MAX: '1',
      RATE_LIMIT_WINDOW_MS: '60000'
    });
    const req = requestMock('memory-ip');
    const firstRes = responseMock();
    const secondRes = responseMock();
    const next = vi.fn() as NextFunction;

    rateLimit(req, firstRes, next);
    rateLimit(req, secondRes, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(secondRes.status).toHaveBeenCalledWith(429);
  });

  it('prunes expired in-memory buckets in long-running processes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));

    const { memoryRateLimitBucketCount, rateLimit } = await loadRateLimiter({
      RATE_LIMIT_STORE: 'memory',
      RATE_LIMIT_MAX: '1000',
      RATE_LIMIT_WINDOW_MS: '1'
    });
    const next = vi.fn() as NextFunction;

    for (let index = 0; index < 99; index += 1) {
      rateLimit(requestMock(`old-ip-${index}`), responseMock(), next);
    }

    expect(memoryRateLimitBucketCount()).toBe(99);

    vi.setSystemTime(new Date('2026-06-13T12:00:01.000Z'));
    rateLimit(requestMock('new-ip'), responseMock(), next);

    expect(memoryRateLimitBucketCount()).toBe(1);
  });

  it('uses Redis when configured', async () => {
    const redisClient = await import('../services/redisClient');

    vi.mocked(redisClient.getRedisClient).mockResolvedValue(redisMock as any);
    redisMock.incr.mockResolvedValue(1);

    const { rateLimit } = await loadRateLimiter({
      RATE_LIMIT_STORE: 'redis',
      REDIS_URL: 'redis://localhost:6379',
      RATE_LIMIT_MAX: '10',
      RATE_LIMIT_WINDOW_MS: '60000'
    });
    const res = responseMock();
    const next = vi.fn() as NextFunction;

    rateLimit(requestMock('redis-ip'), res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(redisMock.incr).toHaveBeenCalledWith('rate-limit:redis-ip');
    expect(redisMock.pExpire).toHaveBeenCalledWith('rate-limit:redis-ip', 60000);
  });

  it('falls back to memory when Redis is unavailable', async () => {
    const redisClient = await import('../services/redisClient');

    vi.mocked(redisClient.getRedisClient).mockResolvedValue(null);

    const { rateLimit } = await loadRateLimiter({
      RATE_LIMIT_STORE: 'redis',
      REDIS_URL: 'redis://localhost:6379',
      RATE_LIMIT_MAX: '1',
      RATE_LIMIT_WINDOW_MS: '60000'
    });
    const req = requestMock('fallback-ip');
    const firstRes = responseMock();
    const secondRes = responseMock();
    const next = vi.fn() as NextFunction;

    rateLimit(req, firstRes, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    rateLimit(req, secondRes, next);
    await vi.waitFor(() => expect(secondRes.status).toHaveBeenCalledWith(429));
  });
});
