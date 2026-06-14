import axios from 'axios';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { env } from '../config/env';
import { SourceDefinition } from '../models/xmltv';
import { fetchSchedulesDirectXmltv } from './schedulesDirect';
import { assertResolvedSourceUrlAllowed, resolveSourceRedirectUrl } from './sourceUrl';

export class SourceFetchError extends Error {
  readonly statusCode?: number;
  readonly url?: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      url?: string;
      retryable?: boolean;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'SourceFetchError';
    this.statusCode = options.statusCode;
    this.url = options.url;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number) {
  return env.SOURCE_RETRY_DELAY_MS * Math.max(1, attempt);
}

function inflateDeflate(buffer: Buffer) {
  try {
    return zlib.inflateSync(buffer);
  } catch {
    return zlib.inflateRawSync(buffer);
  }
}

function decodeSourceBody(
  data: unknown,
  url: string,
  headers: Record<string, unknown>
) {
  if (typeof data === 'string') {
    return data;
  }

  const buffer = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data as ArrayBuffer);
  const encoding = String(headers['content-encoding'] ?? '').toLowerCase();
  const isGzip =
    encoding.includes('gzip') ||
    url.toLowerCase().endsWith('.gz') ||
    buffer.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]));
  const isDeflate =
    encoding.includes('deflate') ||
    url.toLowerCase().endsWith('.zz');
  const isBrotli =
    encoding.includes('br') ||
    url.toLowerCase().endsWith('.br');

  if (isGzip) {
    return zlib.gunzipSync(buffer).toString('utf8');
  }

  if (isDeflate) {
    return inflateDeflate(buffer).toString('utf8');
  }

  if (isBrotli) {
    return zlib.brotliDecompressSync(buffer).toString('utf8');
  }

  return buffer.toString('utf8');
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
      return await fetchWithValidatedRedirects(
        source.name,
        currentUrl
      );
    } catch (error) {
      lastError = error;

      if (
        attempt >= env.SOURCE_FETCH_RETRIES ||
        (error instanceof SourceFetchError && !error.retryable)
      ) {
        break;
      }

      await sleep(retryDelay(attempt + 1));
    }
  }

  throw lastError;
}

function sourceFetchError(
  sourceName: string,
  currentUrl: string,
  error: unknown
) {
  if (error instanceof SourceFetchError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const retryable = !status || status === 429 || status >= 500;

    if (status) {
      return new SourceFetchError(
        `Source ${sourceName} returned HTTP ${status} from ${currentUrl}.`,
        {
          statusCode: status,
          url: currentUrl,
          retryable,
          cause: error
        }
      );
    }

    if (error.code === 'ECONNABORTED') {
      return new SourceFetchError(
        `Source ${sourceName} timed out fetching ${currentUrl}.`,
        {
          url: currentUrl,
          retryable: true,
          cause: error
        }
      );
    }

    return new SourceFetchError(
      `Source ${sourceName} could not be fetched from ${currentUrl}: ${error.message}`,
      {
        url: currentUrl,
        retryable,
        cause: error
      }
    );
  }

  return error;
}

async function fetchWithValidatedRedirects(
  sourceName: string,
  startUrl: string
) {
  let currentUrl = startUrl;

  for (let redirectCount = 0; redirectCount <= env.SOURCE_FETCH_MAX_REDIRECTS; redirectCount++) {
    let response;

    try {
      response = await axios.get(currentUrl, {
        timeout: env.SOURCE_FETCH_TIMEOUT_MS,
        decompress: false,
        headers: {
          'Accept-Encoding': 'gzip, deflate, br'
        },
        maxContentLength: env.SOURCE_FETCH_MAX_MB * 1024 * 1024,
        maxBodyLength: env.SOURCE_FETCH_MAX_MB * 1024 * 1024,
        maxRedirects: 0,
        responseType: 'arraybuffer',
        validateStatus: (status) => status >= 200 && status < 400
      });
    } catch (error) {
      throw sourceFetchError(
        sourceName,
        currentUrl,
        error
      );
    }

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

    return decodeSourceBody(
      response.data,
      currentUrl,
      response.headers ?? {}
    );
  }

  throw new Error(`Source exceeded maximum redirects (${env.SOURCE_FETCH_MAX_REDIRECTS}).`);
}
