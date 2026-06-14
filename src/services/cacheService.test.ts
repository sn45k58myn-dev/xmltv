import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { assertCacheDirectoryWritable, createCachedFeedReadStream, getCachedFeed, getCachedFeedFile, getCachedFeedGzip, listCachedFeedKeys, removeCachedFeed, setCachedFeed, setCachedFeedGzip } from './cacheService';

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
    await expect(getCachedFeedFile('TEST', '.xml')).resolves.toMatchObject({
      size: Buffer.byteLength('<tv />')
    });

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

  it('creates read streams for cached feed files', async () => {
    await setCachedFeed('TEST', '<tv />');
    const file = await getCachedFeedFile('TEST', '.xml');

    expect(file).not.toBeNull();

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      createCachedFeedReadStream(file!)
        .on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        .on('error', reject)
        .on('end', resolve);
    });

    expect(Buffer.concat(chunks).toString('utf8')).toBe('<tv />');
  });

  it('rejects unsafe cache keys before file access', async () => {
    await expect(setCachedFeed('../escape', '<tv />')).rejects.toThrow('Invalid cache feed key');
    await expect(setCachedFeedGzip('bad/name', Buffer.from('gzip'))).rejects.toThrow('Invalid cache feed key');
    await expect(getCachedFeed('../escape')).resolves.toBeNull();
    await expect(getCachedFeedFile('../escape', '.xml')).resolves.toBeNull();
    await expect(getCachedFeedGzip('bad/name')).resolves.toBeNull();
  });

  it('lists unique cached feed keys and removes feed pairs', async () => {
    await setCachedFeed('TEST', '<tv />');
    await setCachedFeedGzip('TEST', Buffer.from('gzip-bytes'));

    await expect(listCachedFeedKeys()).resolves.toContain('TEST');

    await removeCachedFeed('TEST');

    await expect(getCachedFeed('TEST')).resolves.toBeNull();
    await expect(getCachedFeedGzip('TEST')).resolves.toBeNull();
  });

  it('rejects unsafe cache keys before removal', async () => {
    await expect(removeCachedFeed('../escape')).rejects.toThrow('Invalid cache feed key');
  });
});
