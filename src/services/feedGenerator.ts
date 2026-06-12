import { exportCountry, exportProvider } from '../exports/exportService';
import { prisma } from '../db/prisma';
import {
  assertCacheDirectoryWritable,
  setCachedFeed,
  setCachedFeedGzip
} from './cacheService';
import { compressXml } from './gzipService';
import { providerFeedKey } from './feedKeys';

export async function rebuildFeeds() {
  console.log('Rebuilding cached feeds...');

  await assertCacheDirectoryWritable();

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

  const providers = await prisma.mapping.groupBy({
    by: ['providerId'],
    orderBy: {
      providerId: 'asc'
    }
  });

  for (const provider of providers) {
    const key = providerFeedKey(provider.providerId);

    console.log(`Building provider feed for ${provider.providerId}`);

    const xml = await exportProvider(provider.providerId);

    await setCachedFeed(
      key,
      xml
    );

    await setCachedFeedGzip(
      key,
      await compressXml(xml)
    );
  }

  console.log('Cached feeds rebuilt');
}
