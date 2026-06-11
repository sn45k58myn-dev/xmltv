import { exportCountry } from '../exports/exportService';
import {
  setCachedFeed,
  setCachedFeedGzip
} from './cacheService';
import { compressXml } from './gzipService';

export async function rebuildFeeds() {
  console.log('Rebuilding cached feeds...');

  // UK
  const uk = await exportCountry('uk');

  await setCachedFeed('uk', uk);

  const ukGzip = await compressXml(uk);

  await setCachedFeedGzip(
    'uk',
    ukGzip
  );

  // US
  const us = await exportCountry('us');

  await setCachedFeed('us', us);

  const usGzip = await compressXml(us);

  await setCachedFeedGzip(
    'us',
    usGzip
  );

  console.log('Cached feeds rebuilt');
}