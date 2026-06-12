import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db/prisma';

const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);

function feedKind(file: string) {
  if (file.endsWith('.xml.gz')) return 'gzip';
  if (file.endsWith('.xml')) return 'xml';
  return 'unknown';
}

export async function getFeedMetadata() {
  let cacheFiles: string[] = [];

  try {
    cacheFiles = await fs.readdir(CACHE_DIR);
  } catch {
    cacheFiles = [];
  }

  const cachedFeeds = await Promise.all(
    cacheFiles
      .filter((file) => file.endsWith('.xml') || file.endsWith('.xml.gz'))
      .map(async (file) => {
        const stat = await fs.stat(path.join(CACHE_DIR, file));

        return {
          feedKey: file,
          country: file.replace(/\.xml(\.gz)?$/, ''),
          type: feedKind(file),
          bytes: stat.size,
          megabytes: Number((stat.size / 1024 / 1024).toFixed(2)),
          updatedAt: stat.mtime.toISOString()
        };
      })
  );

  const [
    channels,
    programStats
  ] = await Promise.all([
    prisma.channel.findMany({
      where: {
        country: {
          not: null
        }
      },
      select: {
        id: true,
        country: true
      }
    }),
    prisma.program.groupBy({
      by: ['channelId'],
      _count: {
        _all: true
      },
      _min: {
        start: true
      },
      _max: {
        stop: true
      }
    })
  ]);
  const statsByChannel = new Map(
    programStats.map((row) => [row.channelId, row])
  );
  const countryMap = new Map<string, {
    country: string;
    channels: number;
    programs: number;
    firstProgramStart?: string;
    lastProgramStop?: string;
  }>();

  for (const channel of channels) {
    if (!channel.country) continue;

    const current = countryMap.get(channel.country) ?? {
      country: channel.country,
      channels: 0,
      programs: 0
    };
    const stats = statsByChannel.get(channel.id);
    const first = stats?._min.start?.toISOString();
    const last = stats?._max.stop?.toISOString();

    current.channels++;
    current.programs += stats?._count._all ?? 0;

    if (first && (!current.firstProgramStart || first < current.firstProgramStart)) {
      current.firstProgramStart = first;
    }

    if (last && (!current.lastProgramStop || last > current.lastProgramStop)) {
      current.lastProgramStop = last;
    }

    countryMap.set(channel.country, current);
  }

  return {
    generatedAt: new Date().toISOString(),
    cacheDirectory: CACHE_DIR,
    cachedFeeds: cachedFeeds.sort((a, b) => a.feedKey.localeCompare(b.feedKey)),
    countries: Array.from(countryMap.values()).sort((a, b) => a.country.localeCompare(b.country))
  };
}
