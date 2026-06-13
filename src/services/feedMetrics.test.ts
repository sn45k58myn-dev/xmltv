import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFeedSizes } from './feedMetrics';

let tempDir: string;

describe('getFeedSizes', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xmltv-feed-metrics-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, {
      recursive: true,
      force: true
    });
  });

  it('reports only cached XMLTV feed files', async () => {
    await fs.writeFile(path.join(tempDir, 'GB.xml'), '1234');
    await fs.writeFile(path.join(tempDir, 'GB.xml.gz'), '12');
    await fs.writeFile(path.join(tempDir, 'notes.txt'), 'not a feed');
    await fs.mkdir(path.join(tempDir, 'nested.xml'));

    await expect(getFeedSizes(tempDir)).resolves.toEqual([
      {
        feed: 'GB.xml',
        bytes: 4,
        megabytes: 0
      },
      {
        feed: 'GB.xml.gz',
        bytes: 2,
        megabytes: 0
      }
    ]);
  });
});
