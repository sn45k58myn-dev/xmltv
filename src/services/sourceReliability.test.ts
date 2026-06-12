import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { shouldBackoffSource, withImportTimeout } from './sourceReliability';

vi.mock('../db/prisma', () => ({
  prisma: {
    sourceHealth: {
      findFirst: vi.fn()
    }
  }
}));

describe('sourceReliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('backs off a source after a recent failure', async () => {
    vi.mocked(prisma.sourceHealth.findFirst).mockResolvedValue({
      status: 'failed',
      checkedAt: new Date()
    } as any);

    await expect(shouldBackoffSource('source-1')).resolves.toBe(true);
  });

  it('does not back off after a successful latest health check', async () => {
    vi.mocked(prisma.sourceHealth.findFirst).mockResolvedValue({
      status: 'success',
      checkedAt: new Date()
    } as any);

    await expect(shouldBackoffSource('source-1')).resolves.toBe(false);
  });

  it('times out slow imports', async () => {
    vi.useFakeTimers();

    const assertion = expect(
      withImportTimeout(
        'Slow Source',
        new Promise((resolve) => setTimeout(resolve, 60_000_000))
      )
    ).rejects.toThrow('Import timed out for Slow Source');

    await vi.advanceTimersByTimeAsync(1_800_000);
    await assertion;
    vi.useRealTimers();
  });
});
