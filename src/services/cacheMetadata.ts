import { env } from '../config/env';
import { getRedisClient } from './redisClient';

const CACHE_METADATA_HASH = 'cache-metadata:feeds';

export type CacheMetadataEntry = {
  feedKey: string;
  country: string;
  type: string;
  bytes: number;
  megabytes: number;
  updatedAt: string;
};

function feedKind(file: string) {
  if (file.endsWith('.xml.gz')) return 'gzip';
  if (file.endsWith('.xml')) return 'xml';
  return 'unknown';
}

function cacheIdentity(file: string) {
  const feedKey = file.replace(/\.xml(\.gz)?$/, '');

  return {
    feedKey,
    country: feedKey
  };
}

export function buildCacheMetadataEntry(
  file: string,
  bytes: number,
  updatedAt = new Date()
): CacheMetadataEntry {
  const identity = cacheIdentity(file);

  return {
    feedKey: file,
    country: identity.country,
    type: feedKind(file),
    bytes,
    megabytes: Number((bytes / 1024 / 1024).toFixed(2)),
    updatedAt: updatedAt.toISOString()
  };
}

export async function recordCacheMetadata(
  file: string,
  bytes: number
) {
  if (env.CACHE_METADATA_STORE !== 'redis') return;

  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.hSet(
      CACHE_METADATA_HASH,
      file,
      JSON.stringify(buildCacheMetadataEntry(file, bytes))
    );
  } catch (error) {
    console.error('Unable to record Redis cache metadata:', error);
  }
}

export async function listRedisCacheMetadata(): Promise<CacheMetadataEntry[] | null> {
  if (env.CACHE_METADATA_STORE !== 'redis') return null;

  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const values = await redis.hVals(CACHE_METADATA_HASH);

    return values.map((value) => JSON.parse(value) as CacheMetadataEntry);
  } catch (error) {
    console.error('Unable to read Redis cache metadata:', error);
    return null;
  }
}
