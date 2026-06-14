import { exportCountry, exportProvider } from '../exports/exportService';
import { prisma } from '../db/prisma';
import {
  assertCacheDirectoryWritable,
  listCachedFeedKeys,
  removeCachedFeed,
  setCachedFeed,
  setCachedFeedGzip
} from './cacheService';
import { compressXml } from './gzipService';
import { providerFeedKey } from './feedKeys';

const COUNTRY_FEED_KEY = /^[A-Z]{2,3}$/;

function isGeneratedFeedKey(key: string) {
  return COUNTRY_FEED_KEY.test(key) || key.startsWith('provider_');
}

export async function rebuildFeeds() {
  console.log('Rebuilding cached feeds...');

  await assertCacheDirectoryWritable();
  const activeFeedKeys = new Set<string>();

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
    activeFeedKeys.add(country);

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
    activeFeedKeys.add(key);

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

  const cachedFeedKeys = await listCachedFeedKeys();

  for (const key of cachedFeedKeys) {
    if (!isGeneratedFeedKey(key) || activeFeedKeys.has(key)) {
      continue;
    }

    console.log(`Removing stale cached feed ${key}`);
    await removeCachedFeed(key);
  }

  console.log('Cached feeds rebuilt');
}
