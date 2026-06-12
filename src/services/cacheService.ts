import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';

const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);

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
      path.join(
        CACHE_DIR,
        `${name}.xml`
      ),
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
  await atomicWrite(
    path.join(
      CACHE_DIR,
      `${name}.xml`
    ),
    xml,
    'utf8'
  );
}

export async function setCachedFeedGzip(
  name: string,
  data: Buffer
) {
  await atomicWrite(
    path.join(
      CACHE_DIR,
      `${name}.xml.gz`
    ),
    data
  );
}

export async function getCachedFeedGzip(
  name: string
): Promise<Buffer | null> {
  try {
    return await fs.readFile(
      path.join(
        CACHE_DIR,
        `${name}.xml.gz`
      )
    );
  } catch {
    return null;
  }
}
