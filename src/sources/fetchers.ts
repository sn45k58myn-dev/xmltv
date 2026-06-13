import axios from 'axios';
import fs from 'node:fs/promises';
import { env } from '../config/env';
import { SourceDefinition } from '../models/xmltv';
import { fetchSchedulesDirectXmltv } from './schedulesDirect';
import { assertResolvedSourceUrlAllowed } from './sourceUrl';

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
  await assertResolvedSourceUrlAllowed(source.url);

  let lastError: unknown;

  for (let attempt = 0; attempt <= env.SOURCE_FETCH_RETRIES; attempt++) {
    try {
      const response = await axios.get(source.url, {
        timeout: env.SOURCE_FETCH_TIMEOUT_MS,
        maxContentLength: env.SOURCE_FETCH_MAX_MB * 1024 * 1024,
        maxBodyLength: env.SOURCE_FETCH_MAX_MB * 1024 * 1024,
        maxRedirects: env.SOURCE_FETCH_MAX_REDIRECTS,
        responseType: 'text',
        validateStatus: (status) => status >= 200 && status < 300
      });

      return response.data;
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
