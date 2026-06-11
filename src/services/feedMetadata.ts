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

  const countryRows = await prisma.channel.groupBy({
    by: ['country'],
    _count: true,
    where: {
      country: {
        not: null
      }
    }
  });
  const countries = [];

  for (const row of countryRows) {
    if (!row.country) continue;

    const channelIds = await prisma.channel.findMany({
      where: {
        country: row.country
      },
      select: {
        id: true
      }
    });
    const ids = channelIds.map((channel) => channel.id);
    const [
      programs,
      firstProgram,
      lastProgram
    ] = await Promise.all([
      prisma.program.count({
        where: {
          channelId: {
            in: ids
          }
        }
      }),
      prisma.program.findFirst({
        where: {
          channelId: {
            in: ids
          }
        },
        orderBy: {
          start: 'asc'
        },
        select: {
          start: true
        }
      }),
      prisma.program.findFirst({
        where: {
          channelId: {
            in: ids
          }
        },
        orderBy: {
          stop: 'desc'
        },
        select: {
          stop: true
        }
      })
    ]);

    countries.push({
      country: row.country,
      channels: row._count,
      programs,
      firstProgramStart: firstProgram?.start.toISOString(),
      lastProgramStop: lastProgram?.stop.toISOString()
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    cacheDirectory: CACHE_DIR,
    cachedFeeds: cachedFeeds.sort((a, b) => a.feedKey.localeCompare(b.feedKey)),
    countries: countries.sort((a, b) => a.country.localeCompare(b.country))
  };
}
