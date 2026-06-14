import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import {
  claimNextJob,
  enqueueJob,
  finishQueuedJob,
  getQueueHealth,
  requeueStaleRunningJobs,
  retryFailedQueuedJob,
  retryQueuedJob
} from './jobQueue';

vi.mock('../config/env', () => ({
  env: {
    WORKER_LOCK_TTL_MS: 30000,
    WORKER_POLL_MS: 5000
  }
}));

vi.mock('../db/prisma', () => ({
  prisma: {
    jobQueue: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn()
    },
    $queryRaw: vi.fn()
  }
}));

const job = {
  id: 'job-1',
  type: 'manual-imports',
  status: 'running',
  payload: null,
  result: null,
  error: null,
  attempts: 1,
  maxAttempts: 3,
  runAfter: new Date(),
  lockedBy: 'worker-1',
  lockedUntil: new Date(),
  startedAt: new Date(),
  finishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe('jobQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues jobs with JSON payloads', async () => {
    vi.mocked(prisma.jobQueue.create).mockResolvedValue(job as any);

    await enqueueJob(
      'manual-imports',
      {
        requestedBy: 'admin'
      },
      {
        maxAttempts: 2
      }
    );

    expect(prisma.jobQueue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'manual-imports',
        payload: '{"requestedBy":"admin"}',
        maxAttempts: 2
      })
    });
  });

  it('rejects unknown queued job types before writing to the database', async () => {
    await expect(enqueueJob('unknown-job')).rejects.toThrow('Unknown queued job type');

    expect(prisma.jobQueue.create).not.toHaveBeenCalled();
  });

  it('rejects oversized queued job payloads before writing to the database', async () => {
    await expect(enqueueJob(
      'manual-imports',
      {
        data: 'x'.repeat(70 * 1024)
      }
    )).rejects.toThrow('Queued job payload exceeds');

    expect(prisma.jobQueue.create).not.toHaveBeenCalled();
  });

  it('claims the next available job with a worker lock', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([job] as any);

    await expect(claimNextJob('worker-1')).resolves.toEqual(job);
  });

  it('records successful queued jobs', async () => {
    vi.mocked(prisma.jobQueue.update).mockResolvedValue({
      ...job,
      status: 'success'
    } as any);

    await finishQueuedJob(
      'job-1',
      'success',
      [{ status: 'success' }]
    );

    expect(prisma.jobQueue.update).toHaveBeenCalledWith({
      where: {
        id: 'job-1'
      },
      data: expect.objectContaining({
        status: 'success',
        result: '[{"status":"success"}]',
        lockedBy: null,
        lockedUntil: null
      })
    });
  });

  it('requeues failed jobs until max attempts are reached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));
    vi.mocked(prisma.jobQueue.update).mockResolvedValue(job as any);

    await retryQueuedJob(
      {
        ...job,
        attempts: 2
      } as any,
      new Error('temporary')
    );

    expect(prisma.jobQueue.update).toHaveBeenCalledWith({
      where: {
        id: 'job-1'
      },
      data: expect.objectContaining({
        status: 'pending',
        runAfter: new Date('2026-06-13T12:00:10.000Z'),
        lockedBy: null,
        lockedUntil: null
      })
    });
    vi.useRealTimers();
  });

  it('allows WebGrab+Plus import jobs', async () => {
    vi.mocked(prisma.jobQueue.create).mockResolvedValue({
      ...job,
      type: 'webgrab-run'
    } as any);

    await enqueueJob('webgrab-run');

    expect(prisma.jobQueue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'webgrab-run'
      })
    });
  });

  it('summarizes queue health for operations', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));
    vi.mocked(prisma.jobQueue.groupBy).mockResolvedValue([
      {
        status: 'pending',
        _count: {
          _all: 2
        }
      },
      {
        status: 'running',
        _count: {
          _all: 1
        }
      }
    ] as any);
    vi.mocked(prisma.jobQueue.findFirst).mockResolvedValue({
      createdAt: new Date('2026-06-13T11:55:00.000Z')
    } as any);
    vi.mocked(prisma.jobQueue.count)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    await expect(getQueueHealth()).resolves.toMatchObject({
      pendingJobs: 2,
      runningJobs: 4,
      staleRunningJobs: 1,
      failedJobs: 3,
      oldestPendingAgeSeconds: 300
    });

    vi.useRealTimers();
  });

  it('retries failed queued jobs by reopening attempts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));
    vi.mocked(prisma.jobQueue.updateMany).mockResolvedValue({ count: 1 } as any);

    await retryFailedQueuedJob('job-1');

    expect(prisma.jobQueue.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        status: 'failed'
      },
      data: expect.objectContaining({
        status: 'pending',
        runAfter: new Date('2026-06-13T12:00:00.000Z'),
        lockedBy: null,
        lockedUntil: null,
        finishedAt: null,
        error: null,
        maxAttempts: {
          increment: 1
        }
      })
    });

    vi.useRealTimers();
  });

  it('requeues stale running jobs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));
    vi.mocked(prisma.jobQueue.updateMany).mockResolvedValue({ count: 2 } as any);

    await requeueStaleRunningJobs();

    expect(prisma.jobQueue.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'running',
        lockedUntil: {
          lt: new Date('2026-06-13T12:00:00.000Z')
        }
      },
      data: {
        status: 'pending',
        runAfter: new Date('2026-06-13T12:00:00.000Z'),
        lockedBy: null,
        lockedUntil: null
      }
    });

    vi.useRealTimers();
  });
});
