import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { recordCacheMetadata, removeCacheMetadata } from './cacheMetadata';

const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);
const SAFE_CACHE_KEY = /^[A-Za-z0-9_.-]+$/;

function cachePath(
  name: string,
  extension: '.xml' | '.xml.gz'
) {
  if (!SAFE_CACHE_KEY.test(name)) {
    throw new Error(`Invalid cache feed key: ${name}`);
  }

  return path.join(
    CACHE_DIR,
    `${name}${extension}`
  );
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, {
    recursive: true
  });
}

function cacheKeyFromFile(file: string) {
  if (file.endsWith('.xml.gz')) return file.slice(0, -7);
  if (file.endsWith('.xml')) return file.slice(0, -4);
  return undefined;
}

async function atomicWrite(
  filePath: string,
  data: string | Buffer,
  encoding?: BufferEncoding
) {
  await ensureCacheDir();

  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    await fs.writeFile(
      tempPath,
      data,
      encoding
    );
    await fs.rename(
      tempPath,
      filePath
    );
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function assertCacheDirectoryWritable() {
  await ensureCacheDir();

  const probe = path.join(
    CACHE_DIR,
    `.write-test-${process.pid}-${crypto.randomUUID()}`
  );

  await fs.writeFile(
    probe,
    'ok',
    'utf8'
  );
  await fs.unlink(probe);
}

export async function getCachedFeed(
  name: string
): Promise<string | null> {
  try {
    return await fs.readFile(
      cachePath(name, '.xml'),
      'utf8'
    );
  } catch {
    return null;
  }
}

export async function setCachedFeed(
  name: string,
  xml: string
) {
  const filePath = cachePath(name, '.xml');
  const file = path.basename(filePath);

  await atomicWrite(
    filePath,
    xml,
    'utf8'
  );
  await recordCacheMetadata(
    file,
    Buffer.byteLength(xml, 'utf8')
  );
}

export async function setCachedFeedGzip(
  name: string,
  data: Buffer
) {
  const filePath = cachePath(name, '.xml.gz');
  const file = path.basename(filePath);

  await atomicWrite(
    filePath,
    data
  );
  await recordCacheMetadata(
    file,
    data.length
  );
}

export async function listCachedFeedKeys(): Promise<string[]> {
  try {
    const entries = await fs.readdir(CACHE_DIR, {
      withFileTypes: true
    });
    const keys = new Set<string>();

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const key = cacheKeyFromFile(entry.name);

      if (key && SAFE_CACHE_KEY.test(key)) {
        keys.add(key);
      }
    }

    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function removeCachedFeed(name: string) {
  if (!SAFE_CACHE_KEY.test(name)) {
    throw new Error(`Invalid cache feed key: ${name}`);
  }

  await Promise.all([
    fs.unlink(cachePath(name, '.xml')).catch(() => undefined),
    fs.unlink(cachePath(name, '.xml.gz')).catch(() => undefined),
    removeCacheMetadata(`${name}.xml`),
    removeCacheMetadata(`${name}.xml.gz`)
  ]);
}

export async function getCachedFeedGzip(
  name: string
): Promise<Buffer | null> {
  try {
    return await fs.readFile(
      cachePath(name, '.xml.gz')
    );
  } catch {
    return null;
  }
}
