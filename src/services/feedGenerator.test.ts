import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { exportCountry, exportProvider } from '../exports/exportService';
import { compressXml } from './gzipService';
import {
  assertCacheDirectoryWritable,
  listCachedFeedKeys,
  removeCachedFeed,
  setCachedFeed,
  setCachedFeedGzip
} from './cacheService';
import { rebuildFeeds } from './feedGenerator';

vi.mock('../db/prisma', () => ({
  prisma: {
    channel: {
      findMany: vi.fn()
    },
    mapping: {
      groupBy: vi.fn()
    }
  }
}));

vi.mock('../exports/exportService', () => ({
  exportCountry: vi.fn(),
  exportProvider: vi.fn()
}));

vi.mock('./gzipService', () => ({
  compressXml: vi.fn()
}));

vi.mock('./cacheService', () => ({
  assertCacheDirectoryWritable: vi.fn(),
  listCachedFeedKeys: vi.fn(),
  removeCachedFeed: vi.fn(),
  setCachedFeed: vi.fn(),
  setCachedFeedGzip: vi.fn()
}));

describe('feedGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertCacheDirectoryWritable).mockResolvedValue(undefined);
    vi.mocked(exportCountry).mockResolvedValue('<tv country="GB"></tv>');
    vi.mocked(exportProvider).mockResolvedValue('<tv provider="one"></tv>');
    vi.mocked(compressXml).mockResolvedValue(Buffer.from('gzip'));
    vi.mocked(listCachedFeedKeys).mockResolvedValue([]);
  });

  it('rebuilds country and provider feeds', async () => {
    vi.mocked(prisma.channel.findMany).mockResolvedValue([
      {
        country: 'gb'
      }
    ] as any);
    vi.mocked(prisma.mapping.groupBy).mockResolvedValue([
      {
        providerId: 'provider-one'
      }
    ] as any);

    await rebuildFeeds();

    expect(exportCountry).toHaveBeenCalledWith('GB');
    expect(exportProvider).toHaveBeenCalledWith('provider-one');
    expect(setCachedFeed).toHaveBeenCalledWith('GB', '<tv country="GB"></tv>');
    expect(setCachedFeed).toHaveBeenCalledWith('provider_provider-one', '<tv provider="one"></tv>');
    expect(setCachedFeedGzip).toHaveBeenCalledWith('GB', Buffer.from('gzip'));
    expect(setCachedFeedGzip).toHaveBeenCalledWith('provider_provider-one', Buffer.from('gzip'));
  });

  it('removes stale generated feeds without deleting unrelated cache keys', async () => {
    vi.mocked(prisma.channel.findMany).mockResolvedValue([
      {
        country: 'GB'
      }
    ] as any);
    vi.mocked(prisma.mapping.groupBy).mockResolvedValue([]);
    vi.mocked(listCachedFeedKeys).mockResolvedValue([
      'GB',
      'US',
      'provider_old',
      'sports',
      'CUSTOM'
    ]);

    await rebuildFeeds();

    expect(removeCachedFeed).toHaveBeenCalledWith('US');
    expect(removeCachedFeed).toHaveBeenCalledWith('provider_old');
    expect(removeCachedFeed).not.toHaveBeenCalledWith('GB');
    expect(removeCachedFeed).not.toHaveBeenCalledWith('sports');
    expect(removeCachedFeed).not.toHaveBeenCalledWith('CUSTOM');
  });
});
