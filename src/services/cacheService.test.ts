import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { assertCacheDirectoryWritable, getCachedFeed, getCachedFeedGzip, setCachedFeed, setCachedFeedGzip } from './cacheService';

const cacheDir = path.join(
  process.cwd(),
  'cache'
);

describe('cacheService', () => {
  beforeEach(async () => {
    await Promise.all([
      fs.unlink(path.join(cacheDir, 'TEST.xml')).catch(() => undefined),
      fs.unlink(path.join(cacheDir, 'TEST.xml.gz')).catch(() => undefined)
    ]);
  });

  it('writes XML cache files atomically', async () => {
    await setCachedFeed('TEST', '<tv />');

    expect(await getCachedFeed('TEST')).toBe('<tv />');

    const files = await fs.readdir(cacheDir);
    expect(files).toContain('TEST.xml');
    expect(files.some((file) => file.includes('TEST.xml.') && file.endsWith('.tmp'))).toBe(false);
  });

  it('writes gzip cache files without leaving temp files', async () => {
    await setCachedFeedGzip('TEST', Buffer.from('gzip-bytes'));

    const files = await fs.readdir(cacheDir);
    expect(files).toContain('TEST.xml.gz');
    expect(files.some((file) => file.includes('TEST.xml.gz.') && file.endsWith('.tmp'))).toBe(false);
  });

  it('checks cache directory writability', async () => {
    await expect(assertCacheDirectoryWritable()).resolves.toBeUndefined();
  });

  it('rejects unsafe cache keys before file access', async () => {
    await expect(setCachedFeed('../escape', '<tv />')).rejects.toThrow('Invalid cache feed key');
    await expect(setCachedFeedGzip('bad/name', Buffer.from('gzip'))).rejects.toThrow('Invalid cache feed key');
    await expect(getCachedFeed('../escape')).resolves.toBeNull();
    await expect(getCachedFeedGzip('bad/name')).resolves.toBeNull();
  });
});
