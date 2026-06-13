import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { recordFeedDownload } from './downloadMetrics';

vi.mock('../db/prisma', () => ({
  prisma: {
    feedDownload: {
      upsert: vi.fn()
    }
  }
}));

describe('recordFeedDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records feed download metrics when the database is available', async () => {
    vi.mocked(prisma.feedDownload.upsert).mockResolvedValue({
      feedKey: 'GB.xml',
      downloads: 1,
      lastDownloaded: new Date('2026-06-13T12:00:00.000Z')
    } as any);

    await expect(recordFeedDownload('GB.xml')).resolves.toMatchObject({
      feedKey: 'GB.xml',
      downloads: 1
    });
  });

  it('does not fail feed delivery when download metrics cannot be recorded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(prisma.feedDownload.upsert).mockRejectedValue(new Error('database unavailable'));

    await expect(recordFeedDownload('GB.xml')).resolves.toBeNull();

    expect(console.error).toHaveBeenCalledWith(
      'Unable to record feed download for GB.xml:',
      expect.any(Error)
    );
  });
});
