import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { getDashboardStats } from './dashboardService';

vi.mock('../db/prisma', () => ({
  prisma: {
    channel: {
      count: vi.fn()
    },
    program: {
      count: vi.fn()
    },
    alias: {
      count: vi.fn()
    },
    source: {
      count: vi.fn()
    },
    importRun: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn()
    },
    jobQueue: {
      groupBy: vi.fn(),
      findFirst: vi.fn()
    }
  }
}));

vi.mock('./downloadMetrics', () => ({
  getFeedDownloads: vi.fn().mockResolvedValue([])
}));

vi.mock('./feedMetrics', () => ({
  getFeedSizes: vi.fn().mockResolvedValue([])
}));

describe('getDashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));
    vi.mocked(prisma.channel.count).mockResolvedValue(1);
    vi.mocked(prisma.program.count).mockResolvedValue(2);
    vi.mocked(prisma.alias.count).mockResolvedValue(3);
    vi.mocked(prisma.source.count).mockResolvedValue(4);
    vi.mocked(prisma.importRun.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.importRun.count).mockResolvedValue(0);
    vi.mocked(prisma.jobQueue.groupBy).mockResolvedValue([
      {
        status: 'pending',
        _count: {
          _all: 2
        }
      }
    ] as any);
    vi.mocked(prisma.jobQueue.findFirst).mockResolvedValue({
      id: 'job-1',
      status: 'pending',
      createdAt: new Date('2026-06-13T11:50:00.000Z')
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tolerates import rows without source relation data', async () => {
    vi.mocked(prisma.importRun.findMany)
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          sourceId: 'source-1',
          source: null,
          status: 'success',
          channelsSeen: 10,
          programsSeen: 20,
          channelsCreated: 1,
          programsCreated: 2,
          startedAt: new Date('2026-06-13T12:00:00.000Z'),
          finishedAt: new Date('2026-06-13T12:01:00.000Z'),
          errors: null
        }
      ] as any)
      .mockResolvedValueOnce([
        {
          id: 'run-2',
          sourceId: null,
          source: null,
          status: 'failed',
          startedAt: new Date('2026-06-13T11:00:00.000Z'),
          finishedAt: new Date('2026-06-13T11:01:00.000Z'),
          errors: 'failed'
        }
      ] as any);

    const stats = await getDashboardStats();

    expect(stats.recentImports[0].source).toBe('source-1');
    expect(stats.recentFailedImports[0].source).toBe('Unknown source');
    expect(stats.queueDepthByStatus).toEqual({
      pending: 2
    });
    expect(stats.oldestPendingQueueJobAgeSeconds).toBe(600);
  });
});
