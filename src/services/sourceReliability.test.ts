import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { shouldBackoffSource, withImportTimeout } from './sourceReliability';

vi.mock('../db/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn()
    },
    source: {
      update: vi.fn()
    },
    sourceHealth: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn()
    }
  }
}));

describe('sourceReliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
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

  it('records source failures without auto-disable when threshold is off', async () => {
    const { recordSourceFailure } = await import('./sourceReliability');

    vi.mocked(prisma.sourceHealth.create).mockResolvedValue({} as any);

    const result = await recordSourceFailure(
      {
        id: 'source-1',
        name: 'Flaky Source',
        type: 'url',
        enabled: true
      },
      'Source returned HTTP 500'
    );

    expect(result).toMatchObject({
      disabled: false,
      failureStreak: 0
    });
    expect(prisma.sourceHealth.create).toHaveBeenCalledWith({
      data: {
        sourceId: 'source-1',
        status: 'failed',
        message: 'Source returned HTTP 500'
      }
    });
    expect(prisma.source.update).not.toHaveBeenCalled();
  });

  it('auto-disables sources that exceed the configured consecutive failure threshold', async () => {
    vi.doMock('../config/env', () => ({
      env: {
        SOURCE_AUTO_DISABLE_FAILURES: 2,
        SOURCE_FAILURE_BACKOFF_MINUTES: 30,
        IMPORT_TIMEOUT_MS: 1_800_000
      }
    }));

    const { recordSourceFailure } = await import('./sourceReliability');

    vi.mocked(prisma.sourceHealth.create).mockResolvedValue({} as any);
    vi.mocked(prisma.sourceHealth.findMany).mockResolvedValue([
      {
        status: 'failed'
      },
      {
        status: 'failed'
      }
    ] as any);
    vi.mocked(prisma.source.update).mockResolvedValue({} as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    const result = await recordSourceFailure(
      {
        id: 'source-1',
        name: 'Flaky Source',
        type: 'url',
        enabled: true
      },
      'Source returned HTTP 500'
    );

    expect(result).toMatchObject({
      disabled: true,
      failureStreak: 2
    });
    expect(prisma.source.update).toHaveBeenCalledWith({
      where: {
        id: 'source-1'
      },
      data: {
        enabled: false
      }
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'source.auto_disable',
        actor: 'system:source-reliability'
      })
    }));
  });
});
