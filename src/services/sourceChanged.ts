import axios from 'axios';
import { env } from '../config/env';
import { assertResolvedSourceUrlAllowed, resolveSourceRedirectUrl } from '../sources/sourceUrl';
import { getSourceCache, updateSourceCache } from './sourceCache';

async function headWithValidatedRedirects(url: string) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= env.SOURCE_FETCH_MAX_REDIRECTS; redirectCount++) {
    const response = await axios.head(currentUrl, {
      timeout: env.SOURCE_HEAD_TIMEOUT_MS,
      maxRedirects: 0,
      validateStatus: () => true
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;

      if (!location || redirectCount >= env.SOURCE_FETCH_MAX_REDIRECTS) {
        return response;
      }

      const redirected = resolveSourceRedirectUrl(
        currentUrl,
        location
      );

      await assertResolvedSourceUrlAllowed(redirected.toString());
      currentUrl = redirected.toString();
      continue;
    }

    return response;
  }

  throw new Error(`Source freshness check exceeded maximum redirects (${env.SOURCE_FETCH_MAX_REDIRECTS}).`);
}

export async function sourceChanged(
  sourceId: string,
  url: string
): Promise<boolean> {
  await assertResolvedSourceUrlAllowed(url);

  try {
    const cache = await getSourceCache(sourceId);

    const response = await headWithValidatedRedirects(url);

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
  } catch (_error) {
    console.warn(
      `Unable to check source freshness, importing anyway`
    );

    return true;
  }
}
