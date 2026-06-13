import axios from 'axios';
import fs from 'node:fs/promises';
import { env } from '../config/env';
import { SourceDefinition } from '../models/xmltv';
import { fetchSchedulesDirectXmltv } from './schedulesDirect';
import { assertResolvedSourceUrlAllowed, resolveSourceRedirectUrl } from './sourceUrl';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number) {
  return env.SOURCE_RETRY_DELAY_MS * Math.max(1, attempt);
}

export async function fetchXmltvSource(source: SourceDefinition): Promise<string> {
  if (source.type === 'upload') {
    if (!source.url) throw new Error('Upload source missing file path');
    return fs.readFile(source.url, 'utf8');
  }

  if (source.type === 'schedules-direct') {
    return fetchSchedulesDirectXmltv();
  }

  if (!source.url) throw new Error(`Source ${source.name} missing URL`);
  const currentUrl = source.url;
  await assertResolvedSourceUrlAllowed(currentUrl);

  let lastError: unknown;

  for (let attempt = 0; attempt <= env.SOURCE_FETCH_RETRIES; attempt++) {
    try {
      return await fetchWithValidatedRedirects(currentUrl);
    } catch (error) {
      lastError = error;

      if (attempt >= env.SOURCE_FETCH_RETRIES) {
        break;
      }

      await sleep(retryDelay(attempt + 1));
    }
  }

  throw lastError;
}

async function fetchWithValidatedRedirects(startUrl: string) {
  let currentUrl = startUrl;

  for (let redirectCount = 0; redirectCount <= env.SOURCE_FETCH_MAX_REDIRECTS; redirectCount++) {
    const response = await axios.get(currentUrl, {
      timeout: env.SOURCE_FETCH_TIMEOUT_MS,
      maxContentLength: env.SOURCE_FETCH_MAX_MB * 1024 * 1024,
      maxBodyLength: env.SOURCE_FETCH_MAX_MB * 1024 * 1024,
      maxRedirects: 0,
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 400
    });

    if (response.status >= 300) {
      const location = response.headers?.location;

      if (!location) {
        throw new Error(`Source redirect from ${currentUrl} did not include a Location header.`);
      }

      if (redirectCount >= env.SOURCE_FETCH_MAX_REDIRECTS) {
        throw new Error(`Source exceeded maximum redirects (${env.SOURCE_FETCH_MAX_REDIRECTS}).`);
      }

      const redirected = resolveSourceRedirectUrl(
        currentUrl,
        location
      );

      await assertResolvedSourceUrlAllowed(redirected.toString());
      currentUrl = redirected.toString();
      continue;
    }

    return response.data;
  }

  throw new Error(`Source exceeded maximum redirects (${env.SOURCE_FETCH_MAX_REDIRECTS}).`);
}
