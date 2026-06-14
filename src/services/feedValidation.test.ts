import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
const originalValidationMaxFeedMb = process.env.VALIDATION_MAX_FEED_MB;

let tempDir: string;
let cacheDir: string;

async function loadValidationService() {
  vi.resetModules();
  process.env.VALIDATION_MAX_FEED_MB = '1';
  process.chdir(tempDir);

  return import('./feedValidation');
}

describe('feedValidation', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(
      os.tmpdir(),
      'xmltv-validation-'
    ));
    cacheDir = path.join(
      tempDir,
      'cache'
    );
    await fs.mkdir(cacheDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);

    if (originalValidationMaxFeedMb === undefined) {
      delete process.env.VALIDATION_MAX_FEED_MB;
    } else {
      process.env.VALIDATION_MAX_FEED_MB = originalValidationMaxFeedMb;
    }

    await fs.rm(
      tempDir,
      {
        recursive: true,
        force: true
      }
    );
    vi.resetModules();
  });

  it('validates regular cached XMLTV files', async () => {
    await fs.writeFile(
      path.join(
        cacheDir,
        'GB.xml'
      ),
      '<tv><channel id="bbc-one"><display-name>BBC One</display-name></channel><programme channel="bbc-one" start="20260613000000 +0000" stop="20260613010000 +0000"><title>News</title></programme></tv>',
      'utf8'
    );

    const { validateCachedFeeds } = await loadValidationService();

    await expect(validateCachedFeeds()).resolves.toMatchObject({
      valid: true,
      checked: 1,
      invalid: 0,
      feeds: [
        {
          feedKey: 'GB.xml',
          valid: true,
          channels: 1,
          programs: 1,
          integrity: {
            channelRefs: 1,
            programmeRefs: 1,
            orphanProgrammes: 0,
            emptyChannels: 0,
            duplicateProgrammeSlots: 0
          }
        }
      ]
    });
  });

  it('reports structural feed integrity warnings for valid XMLTV files', async () => {
    await fs.writeFile(
      path.join(
        cacheDir,
        'warnings.xml'
      ),
      [
        '<tv>',
        '<channel id="itv"><display-name>ITV</display-name></channel>',
        '<channel id="empty"><display-name>Empty</display-name></channel>',
        '<programme channel="itv" start="20260613000000 +0000" stop="20260613010000 +0000"><title>News</title></programme>',
        '<programme channel="itv" start="20260613000000 +0000" stop="20260613010000 +0000"><title>News</title></programme>',
        '</tv>'
      ].join(''),
      'utf8'
    );

    const { validateCachedFeeds } = await loadValidationService();
    const result = await validateCachedFeeds();

    expect(result.feeds[0]).toMatchObject({
      valid: true,
      integrity: {
        channelRefs: 2,
        programmeRefs: 2,
        orphanProgrammes: 0,
        emptyChannels: 1,
        duplicateProgrammeSlots: 1
      }
    });
  });

  it('marks non-regular cache entries invalid instead of reading them', async () => {
    await fs.mkdir(path.join(
      cacheDir,
      'directory.xml'
    ));

    const { validateCachedFeeds } = await loadValidationService();
    const result = await validateCachedFeeds();

    expect(result).toMatchObject({
      valid: false,
      checked: 1,
      invalid: 1
    });
    expect(result.feeds[0].error).toContain('not a regular file');
  });

  it('marks gzip feeds invalid when decompressed output exceeds the validation limit', async () => {
    const xml = `<tv><channel id="large"><display-name>${'A'.repeat(1024 * 1024 + 1)}</display-name></channel></tv>`;

    await fs.writeFile(
      path.join(
        cacheDir,
        'large.xml.gz'
      ),
      gzipSync(xml)
    );

    const { validateCachedFeeds } = await loadValidationService();
    const result = await validateCachedFeeds();

    expect(result).toMatchObject({
      valid: false,
      checked: 1,
      invalid: 1
    });
  });
});
