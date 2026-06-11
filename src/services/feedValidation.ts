import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { parseXmltv } from '../pipeline/parseXmltv';
import { validateXmltv } from '../pipeline/validateXmltv';

const gunzipAsync = promisify(gunzip);
const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);

async function readFeed(file: string) {
  const fullPath = path.join(CACHE_DIR, file);
  const data = await fs.readFile(fullPath);

  if (file.endsWith('.gz')) {
    return (await gunzipAsync(data)).toString('utf8');
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
      const xml = await readFeed(file);
      const parsed = parseXmltv(xml);

      validateXmltv(parsed);

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
