import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { env } from '../config/env';
import { parseXmltv } from '../pipeline/parseXmltv';
import { validateXmltv } from '../pipeline/validateXmltv';
import { getFeedMetadata } from './feedMetadata';

const gunzipAsync = promisify(gunzip);
const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);

function assertWithinTimeout(
  started: number,
  file: string
) {
  if (Date.now() - started > env.VALIDATION_TIMEOUT_MS) {
    throw new Error(
      `Validation timeout after ${env.VALIDATION_TIMEOUT_MS}ms for ${file}`
    );
  }
}

async function readFeed(
  file: string,
  started: number
) {
  const fullPath = path.join(CACHE_DIR, file);
  const stat = await fs.stat(fullPath);
  const maxBytes = env.VALIDATION_MAX_FEED_MB * 1024 * 1024;

  if (stat.size > maxBytes) {
    throw new Error(
      `Feed exceeds validation size limit of ${env.VALIDATION_MAX_FEED_MB}MB`
    );
  }

  const data = await fs.readFile(fullPath);
  assertWithinTimeout(started, file);

  if (file.endsWith('.gz')) {
    const xml = (await gunzipAsync(data)).toString('utf8');
    assertWithinTimeout(started, file);

    return xml;
  }

  return data.toString('utf8');
}

export async function validateCachedFeeds() {
  let files: string[] = [];

  try {
    files = await fs.readdir(CACHE_DIR);
  } catch {
    files = [];
  }

  const feedFiles = files.filter((file) => file.endsWith('.xml') || file.endsWith('.xml.gz'));
  const feeds = [];

  for (const file of feedFiles) {
    const started = Date.now();

    try {
      const xml = await readFeed(
        file,
        started
      );
      const parsed = parseXmltv(xml);
      assertWithinTimeout(started, file);

      validateXmltv(parsed);
      assertWithinTimeout(started, file);

      feeds.push({
        feedKey: file,
        valid: true,
        channels: parsed.channels.length,
        programs: parsed.programs.length,
        durationMs: Date.now() - started
      });
    } catch (error) {
      feeds.push({
        feedKey: file,
        valid: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started
      });
    }
  }

  const invalid = feeds.filter((feed) => !feed.valid);

  return {
    generatedAt: new Date().toISOString(),
    valid: invalid.length === 0,
    checked: feeds.length,
    invalid: invalid.length,
    feeds
  };
}

export async function getValidationSummary() {
  const metadata = await getFeedMetadata();
  const feeds = metadata.cachedFeeds.map((feed) => ({
    feedKey: feed.feedKey,
    type: feed.type,
    bytes: feed.bytes,
    megabytes: feed.megabytes,
    updatedAt: feed.updatedAt,
    downloads: feed.downloads
  }));

  return {
    generatedAt: new Date().toISOString(),
    fullValidation: '/api/admin/validation',
    checked: feeds.length,
    invalid: null,
    valid: null,
    maxFeedMegabytes: env.VALIDATION_MAX_FEED_MB,
    timeoutMs: env.VALIDATION_TIMEOUT_MS,
    feeds
  };
}
