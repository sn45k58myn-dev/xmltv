import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { runOperationalRetention, summarizeOperationalRetention } from './operationalRetention';

vi.mock('../db/prisma', () => ({
  prisma: {
    auditLog: {
      deleteMany: vi.fn()
    },
    jobRun: {
      deleteMany: vi.fn()
    },
    jobQueue: {
      deleteMany: vi.fn()
    },
    feedQualitySnapshot: {
      deleteMany: vi.fn()
    },
    sourceHealth: {
      deleteMany: vi.fn()
    },
    feedDownload: {
      deleteMany: vi.fn()
    }
  }
}));

describe('operational retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));
    process.env.AUDIT_LOG_RETENTION_DAYS = '180';
    process.env.JOB_RUN_RETENTION_DAYS = '90';
    process.env.JOB_QUEUE_RETENTION_DAYS = '30';
    process.env.FEED_QUALITY_RETENTION_DAYS = '180';
    process.env.SOURCE_HEALTH_RETENTION_DAYS = '45';
    process.env.FEED_DOWNLOAD_RETENTION_DAYS = '365';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prunes operational tables using configured retention windows', async () => {
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.jobRun.deleteMany).mockResolvedValue({ count: 2 });
    vi.mocked(prisma.jobQueue.deleteMany).mockResolvedValue({ count: 3 });
    vi.mocked(prisma.feedQualitySnapshot.deleteMany).mockResolvedValue({ count: 4 });
    vi.mocked(prisma.sourceHealth.deleteMany).mockResolvedValue({ count: 5 });
    vi.mocked(prisma.feedDownload.deleteMany).mockResolvedValue({ count: 6 });

    const result = await runOperationalRetention();

    expect(result).toEqual({
      auditLogs: 1,
      jobRuns: 2,
      jobQueue: 3,
      feedQualitySnapshots: 4,
      sourceHealth: 5,
      feedDownloads: 6
    });
    expect(prisma.jobQueue.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date('2026-05-14T12:00:00.000Z')
        },
        status: {
          in: ['success', 'failed']
        }
      }
    });
    expect(prisma.sourceHealth.deleteMany).toHaveBeenCalledWith({
      where: {
        checkedAt: {
          lt: new Date('2025-12-15T12:00:00.000Z')
        }
      }
    });
    expect(prisma.feedDownload.deleteMany).toHaveBeenCalledWith({
      where: {
        lastDownloaded: {
          lt: new Date('2025-06-13T12:00:00.000Z')
        }
      }
    });
  });

  it('summarizes deleted row counts for job history', () => {
    expect(summarizeOperationalRetention({
      auditLogs: 1,
      jobRuns: 2,
      jobQueue: 3,
      feedQualitySnapshots: 4,
      sourceHealth: 5,
      feedDownloads: 6
    })).toBe('auditLogs=1, jobRuns=2, jobQueue=3, feedQualitySnapshots=4, sourceHealth=5, feedDownloads=6');
  });
});
