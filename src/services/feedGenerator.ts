import fs from 'node:fs/promises';
import path from 'node:path';
import { exportCountry } from '../exports/exportService';
import { prisma } from '../db/prisma';
import {
  setCachedFeed,
  setCachedFeedGzip
} from './cacheService';
import { compressXml } from './gzipService';

const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);

export async function rebuildFeeds() {
  console.log('Rebuilding cached feeds...');

  await fs.rm(CACHE_DIR, {
    recursive: true,
    force: true
  });

  await fs.mkdir(CACHE_DIR, {
    recursive: true
  });

  const countries = await prisma.channel.findMany({
    distinct: ['country'],
    select: {
      country: true
    },
    where: {
      country: {
        not: null
      }
    }
  });

  for (const row of countries) {
    const country = row.country?.toUpperCase();

    if (!country) {
      continue;
    }

    console.log(`Building feed for ${country}`);

    const xml = await exportCountry(country);

    await setCachedFeed(
      country,
      xml
    );

    await setCachedFeedGzip(
      country,
      await compressXml(xml)
    );
  }

  console.log('Cached feeds rebuilt');
}
