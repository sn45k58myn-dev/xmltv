import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db/prisma';
import { CacheMetadataEntry, buildCacheMetadataEntry, listRedisCacheMetadata } from './cacheMetadata';

const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);

type CountryMetadata = {
  country: string;
  channels: number;
  programs: number;
  firstProgramStart?: string;
  lastProgramStop?: string;
};

type CachedFeedMetadata = {
  feedKey: string;
  country: string;
  type: string;
  bytes: number;
  megabytes: number;
  updatedAt: string;
  downloads: number;
  lastDownloaded?: string;
};

type CountryProgramRow = {
  country: string;
  programs: bigint | number | null;
  firstProgramStart: Date | null;
  lastProgramStop: Date | null;
};

function cacheIdentity(file: string) {
  const feedKey = file.replace(/\.xml(\.gz)?$/, '');

  return {
    feedKey,
    country: feedKey
  };
}

function dateString(value: Date | string | null | undefined) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

async function getCountryMetadata(): Promise<CountryMetadata[]> {
  const [channelRows, programRows] = await Promise.all([
    prisma.channel.groupBy({
      by: ['country'],
      where: {
        country: {
          not: null
        }
      },
      _count: {
        _all: true
      },
      orderBy: {
        country: 'asc'
      }
    }),
    prisma.$queryRaw<CountryProgramRow[]>`
    SELECT
      c.country AS "country",
      COUNT(p.id) AS "programs",
      MIN(p.start) AS "firstProgramStart",
      MAX(p.stop) AS "lastProgramStop"
    FROM "Channel" c
    INNER JOIN "Program" p ON p."channelId" = c.id
    WHERE c.country IS NOT NULL
    GROUP BY c.country
    ORDER BY c.country ASC
  `
  ]);
  const programsByCountry = new Map(
    programRows.map((row) => [row.country, row])
  );

  return channelRows.map((row) => {
    const country = row.country ?? '';
    const programRow = programsByCountry.get(country);

    return {
      country,
      channels: row._count._all,
      programs: Number(programRow?.programs ?? 0),
      firstProgramStart: dateString(programRow?.firstProgramStart),
      lastProgramStop: dateString(programRow?.lastProgramStop)
    };
  });
}

async function enrichDownloads(
  cachedFeeds: CacheMetadataEntry[]
): Promise<CachedFeedMetadata[]> {
  const downloadKeys = Array.from(
    new Set(
      cachedFeeds.flatMap((feed) => [
        feed.feedKey,
        cacheIdentity(feed.feedKey).feedKey
      ])
    )
  );
  const downloads = downloadKeys.length
    ? await prisma.feedDownload.findMany({
        where: {
          feedKey: {
            in: downloadKeys
          }
        }
      })
    : [];
  const downloadsByFeed = new Map(
    downloads.map((row) => [row.feedKey, row])
  );

  return cachedFeeds.map((feed) => {
    const identity = cacheIdentity(feed.feedKey);
    const download =
      downloadsByFeed.get(feed.feedKey) ?? downloadsByFeed.get(identity.feedKey);

    return {
      ...feed,
      downloads: download?.downloads ?? 0,
      lastDownloaded: download?.lastDownloaded?.toISOString()
    };
  });
}

async function getFilesystemCachedFeeds(): Promise<CacheMetadataEntry[]> {
  let cacheEntries: Array<{ name: string; isFile: () => boolean }> = [];

  try {
    cacheEntries = await fs.readdir(CACHE_DIR, {
      withFileTypes: true
    });
  } catch {
    return [];
  }

  const cacheFiles = cacheEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((file) => file.endsWith('.xml') || file.endsWith('.xml.gz'));

  return Promise.all(
    cacheFiles.map(async (file) => {
      const stat = await fs.stat(path.join(CACHE_DIR, file));

      return buildCacheMetadataEntry(
        file,
        stat.size,
        stat.mtime
      );
    })
  );
}

async function getCachedFeeds(): Promise<CachedFeedMetadata[]> {
  const redisFeeds = await listRedisCacheMetadata();
  const cachedFeeds = redisFeeds?.length
    ? redisFeeds
    : await getFilesystemCachedFeeds();

  return enrichDownloads(cachedFeeds);
}

function summarizeFeedTypes(cachedFeeds: CachedFeedMetadata[]) {
  return cachedFeeds.reduce<Record<string, number>>((summary, feed) => {
    summary[feed.type] = (summary[feed.type] ?? 0) + 1;
    return summary;
  }, {
    xml: 0,
    gzip: 0,
    unknown: 0
  });
}

export async function getFeedMetadata() {
  const [cachedFeeds, countries] = await Promise.all([
    getCachedFeeds(),
    getCountryMetadata()
  ]);
  const sortedCachedFeeds = cachedFeeds.sort((a, b) =>
    a.feedKey.localeCompare(b.feedKey)
  );
  const totalCacheBytes = cachedFeeds.reduce(
    (sum, feed) => sum + feed.bytes,
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    cacheDirectory: CACHE_DIR,
    totalCacheBytes,
    totalCacheMegabytes: Number((totalCacheBytes / 1024 / 1024).toFixed(2)),
    feedCount: cachedFeeds.length,
    feedTypes: summarizeFeedTypes(cachedFeeds),
    cachedFeeds: sortedCachedFeeds,
    countries
  };
}
