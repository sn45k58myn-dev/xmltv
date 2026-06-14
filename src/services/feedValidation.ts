import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzip } from 'node:zlib';
import { env } from '../config/env';
import { parseXmltv } from '../pipeline/parseXmltv';
import { validateXmltv } from '../pipeline/validateXmltv';
import { getFeedMetadata } from './feedMetadata';
import { ParsedXmltv } from '../models/xmltv';

const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);
const SAFE_FEED_FILE = /^[A-Za-z0-9_.-]+\.xml(\.gz)?$/;

function duplicateKey(parts: Array<string | undefined>) {
  return parts.map((part) => part ?? '').join('\0');
}

function analyzeFeedIntegrity(parsed: ParsedXmltv) {
  const channelIds = new Set(parsed.channels.map((channel) => channel.id));
  const channelsWithPrograms = new Set<string>();
  const programmeSlots = new Set<string>();
  const duplicateProgrammeSlots = new Set<string>();
  let orphanProgrammes = 0;

  for (const program of parsed.programs) {
    if (!channelIds.has(program.channel)) {
      orphanProgrammes++;
      continue;
    }

    channelsWithPrograms.add(program.channel);
    const key = duplicateKey([
      program.channel,
      program.start.toISOString(),
      program.stop.toISOString(),
      program.title,
      program.subtitle
    ]);

    if (programmeSlots.has(key)) {
      duplicateProgrammeSlots.add(key);
    } else {
      programmeSlots.add(key);
    }
  }

  return {
    channelRefs: channelIds.size,
    programmeRefs: parsed.programs.length,
    orphanProgrammes,
    emptyChannels: parsed.channels.length - channelsWithPrograms.size,
    duplicateProgrammeSlots: duplicateProgrammeSlots.size
  };
}

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

function gunzipLimited(
  data: Buffer,
  maxBytes: number
) {
  return new Promise<Buffer>((resolve, reject) => {
    gunzip(
      data,
      {
        maxOutputLength: maxBytes
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );
  });
}

async function resolveCacheFeed(
  file: string
) {
  if (!SAFE_FEED_FILE.test(file)) {
    throw new Error(`Invalid cache feed filename: ${file}`);
  }

  const fullPath = path.join(
    CACHE_DIR,
    file
  );
  const [
    cacheRealPath,
    stat
  ] = await Promise.all([
    fs.realpath(CACHE_DIR),
    fs.lstat(fullPath)
  ]);

  if (!stat.isFile()) {
    throw new Error(`Cache feed is not a regular file: ${file}`);
  }

  const fileRealPath = await fs.realpath(fullPath);
  const relativePath = path.relative(
    cacheRealPath,
    fileRealPath
  );

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Cache feed resolves outside cache directory: ${file}`);
  }

  return {
    fullPath,
    stat
  };
}

async function readFeed(
  file: string,
  started: number
) {
  const {
    fullPath,
    stat
  } = await resolveCacheFeed(file);
  const maxBytes = env.VALIDATION_MAX_FEED_MB * 1024 * 1024;

  if (stat.size > maxBytes) {
    throw new Error(
      `Feed exceeds validation size limit of ${env.VALIDATION_MAX_FEED_MB}MB`
    );
  }

  const data = await fs.readFile(fullPath);
  assertWithinTimeout(started, file);

  if (file.endsWith('.gz')) {
    const xml = (await gunzipLimited(
      data,
      maxBytes
    )).toString('utf8');
    assertWithinTimeout(started, file);

    if (Buffer.byteLength(
      xml,
      'utf8'
    ) > maxBytes) {
      throw new Error(
        `Feed exceeds decompressed validation size limit of ${env.VALIDATION_MAX_FEED_MB}MB`
      );
    }

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
        integrity: analyzeFeedIntegrity(parsed),
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
