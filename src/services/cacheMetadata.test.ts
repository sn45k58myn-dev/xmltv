import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = {
  hSet: vi.fn(),
  hDel: vi.fn(),
  hVals: vi.fn()
};

vi.mock('../config/env', () => ({
  env: {
    CACHE_METADATA_STORE: 'redis',
    RATE_LIMIT_STORE: 'memory',
    REDIS_URL: 'redis://localhost:6379'
  }
}));

vi.mock('./redisClient', () => ({
  getRedisClient: vi.fn().mockResolvedValue(redisMock)
}));

describe('cacheMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds cache metadata entries for XML and gzip feeds', async () => {
    const { buildCacheMetadataEntry } = await import('./cacheMetadata');
    const updatedAt = new Date('2026-06-13T00:00:00.000Z');

    expect(buildCacheMetadataEntry('GB.xml', 1024, updatedAt)).toEqual({
      feedKey: 'GB.xml',
      country: 'GB',
      type: 'xml',
      bytes: 1024,
      megabytes: 0,
      updatedAt: updatedAt.toISOString()
    });
    expect(buildCacheMetadataEntry('GB.xml.gz', 1024 * 1024, updatedAt)).toEqual({
      feedKey: 'GB.xml.gz',
      country: 'GB',
      type: 'gzip',
      bytes: 1024 * 1024,
      megabytes: 1,
      updatedAt: updatedAt.toISOString()
    });
  });

  it('records and lists Redis cache metadata', async () => {
    const { listRedisCacheMetadata, recordCacheMetadata } = await import('./cacheMetadata');

    await recordCacheMetadata('US.xml', 2048);

    expect(redisMock.hSet).toHaveBeenCalledWith(
      'cache-metadata:feeds',
      'US.xml',
      expect.stringContaining('"feedKey":"US.xml"')
    );

    redisMock.hVals.mockResolvedValue([
      JSON.stringify({
        feedKey: 'US.xml',
        country: 'US',
        type: 'xml',
        bytes: 2048,
        megabytes: 0,
        updatedAt: '2026-06-13T00:00:00.000Z'
      })
    ]);

    await expect(listRedisCacheMetadata()).resolves.toEqual([
      {
        feedKey: 'US.xml',
        country: 'US',
        type: 'xml',
        bytes: 2048,
        megabytes: 0,
        updatedAt: '2026-06-13T00:00:00.000Z'
      }
    ]);
  });

  it('removes Redis cache metadata entries', async () => {
    const { removeCacheMetadata } = await import('./cacheMetadata');

    await removeCacheMetadata('US.xml');

    expect(redisMock.hDel).toHaveBeenCalledWith(
      'cache-metadata:feeds',
      'US.xml'
    );
  });
});
