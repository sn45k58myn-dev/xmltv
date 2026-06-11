import { prisma } from '../db/prisma';
import { exportCountry } from '../exports/exportService';
import {
  setCachedFeed,
  setCachedFeedGzip
} from './cacheService';
import { compressXml } from './gzipService';

export async function rebuildFeeds() {
  console.log('Rebuilding cached feeds...');

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
    const country = row.country;

    if (!country) {
      continue;
    }

    console.log(
      `Building feed for ${country}`
    );

    const xml = await exportCountry(country);

    await setCachedFeed(
      country,
      xml
    );

    const gzip = await compressXml(xml);

    await setCachedFeedGzip(
      country,
      gzip
    );
  }

  console.log('Cached feeds rebuilt');
}