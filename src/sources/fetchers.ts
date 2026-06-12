import axios from 'axios';
import fs from 'node:fs/promises';
import { env } from '../config/env';
import { SourceDefinition } from '../models/xmltv';

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
    throw new Error('Schedules Direct adapter placeholder: add JSON/token implementation for your lineup, then convert to XMLTV before parsing.');
  }

  if (!source.url) throw new Error(`Source ${source.name} missing URL`);

  let lastError: unknown;

  for (let attempt = 0; attempt <= env.SOURCE_FETCH_RETRIES; attempt++) {
    try {
      const response = await axios.get(source.url, {
        timeout: env.SOURCE_FETCH_TIMEOUT_MS,
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
