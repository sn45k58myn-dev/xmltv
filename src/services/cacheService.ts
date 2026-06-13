import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { recordCacheMetadata } from './cacheMetadata';

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
