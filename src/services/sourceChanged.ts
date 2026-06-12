import axios from 'axios';
import { env } from '../config/env';
import { getSourceCache, updateSourceCache } from './sourceCache';

export async function sourceChanged(
  sourceId: string,
  url: string
): Promise<boolean> {
  try {
    const cache = await getSourceCache(sourceId);

    const response = await axios.head(url, {
      timeout: env.SOURCE_HEAD_TIMEOUT_MS,
      validateStatus: () => true
    });

    if (response.status >= 400) {
      console.warn(
        `Source freshness check returned ${response.status}, importing anyway`
      );

      return true;
    }

    const etag =
      typeof response.headers.etag === 'string'
        ? response.headers.etag
        : undefined;

    const lastModified =
      typeof response.headers['last-modified'] === 'string'
        ? response.headers['last-modified']
        : undefined;

    if (!etag && !lastModified) {
      console.warn(
        'Source freshness check returned no cache validators, importing anyway'
      );

      return true;
    }

    if (!cache) {
      await updateSourceCache(
        sourceId,
        etag,
        lastModified
      );

      return true;
    }

    const changed =
      cache.etag !== etag ||
      cache.lastModified !== lastModified;

    if (changed) {
      await updateSourceCache(
        sourceId,
        etag,
        lastModified
      );
    }

    return changed;
  } catch (error) {
    console.warn(
      `Unable to check source freshness, importing anyway`
    );

    return true;
  }
}
