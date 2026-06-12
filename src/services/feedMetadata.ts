import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db/prisma';
import { getFeedDownloads } from './downloadMetrics';

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

function dateString(value: Date | string | null | undefined) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

async function getCountryMetadata(): Promise<CountryMetadata[]> {
  const rows = await prisma.$queryRaw<Array<{
    country: string;
    channels: bigint | number;
    programs: bigint | number | null;
    firstProgramStart: Date | null;
    lastProgramStop: Date | null;
  }>>`
    SELECT
      c.country AS "country",
      COUNT(DISTINCT c.id) AS "channels",
      COUNT(p.id) AS "programs",
      MIN(p.start) AS "firstProgramStart",
      MAX(p.stop) AS "lastProgramStop"
    FROM "Channel" c
    LEFT JOIN "Program" p ON p."channelId" = c.id
    WHERE c.country IS NOT NULL
    GROUP BY c.country
    ORDER BY c.country ASC
  `;

  return rows.map((row) => ({
    country: row.country,
    channels: Number(row.channels),
    programs: Number(row.programs ?? 0),
    firstProgramStart: dateString(row.firstProgramStart),
    lastProgramStop: dateString(row.lastProgramStop)
  }));
}

export async function getFeedMetadata() {
  let cacheFiles: string[] = [];

  try {
    cacheFiles = await fs.readdir(CACHE_DIR);
  } catch {
    cacheFiles = [];
  }

  const downloads = await getFeedDownloads();
  const downloadsByFeed = new Map(
    downloads.map((row) => [row.feedKey, row])
  );
  const cachedFeeds = await Promise.all(
    cacheFiles
      .filter((file) => file.endsWith('.xml') || file.endsWith('.xml.gz'))
      .map(async (file) => {
        const stat = await fs.stat(path.join(CACHE_DIR, file));
        const identity = cacheIdentity(file);
        const download = downloadsByFeed.get(file) ?? downloadsByFeed.get(identity.feedKey);

        return {
          feedKey: file,
          country: identity.country,
          type: feedKind(file),
          bytes: stat.size,
          megabytes: Number((stat.size / 1024 / 1024).toFixed(2)),
          updatedAt: stat.mtime.toISOString(),
          downloads: download?.downloads ?? 0,
          lastDownloaded: download?.lastDownloaded?.toISOString()
        };
      })
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
    cachedFeeds: cachedFeeds.sort((a, b) => a.feedKey.localeCompare(b.feedKey)),
    countries: await getCountryMetadata()
  };
}
