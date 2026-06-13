import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import {
  claimNextJob,
  enqueueJob,
  finishQueuedJob,
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
      update: vi.fn()
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
});
