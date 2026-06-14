import crypto from 'node:crypto';
import { JobQueue } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { assertKnownJobType, serializeJobPayload } from './jobTypes';

type QueuedJobStatus = 'pending' | 'running' | 'success' | 'failed';

export async function enqueueJob(
  type: string,
  payload?: unknown,
  options: {
    maxAttempts?: number;
    runAfter?: Date;
  } = {}
) {
  assertKnownJobType(type);

  return prisma.jobQueue.create({
    data: {
      type,
      payload: serializeJobPayload(payload),
      maxAttempts: options.maxAttempts ?? 3,
      runAfter: options.runAfter ?? new Date()
    }
  });
}

export async function claimNextJob(
  workerId: string,
  lockTtlMs = env.WORKER_LOCK_TTL_MS
): Promise<JobQueue | null> {
  const lockedUntil = new Date(Date.now() + lockTtlMs);
  const jobs = await prisma.$queryRaw<JobQueue[]>`
    UPDATE "JobQueue"
    SET
      "status" = 'running',
      "attempts" = "attempts" + 1,
      "lockedBy" = ${workerId},
      "lockedUntil" = ${lockedUntil},
      "startedAt" = COALESCE("startedAt", NOW()),
      "updatedAt" = NOW()
    WHERE "id" = (
      SELECT "id"
      FROM "JobQueue"
      WHERE
        (
          "status" = 'pending'
          OR ("status" = 'running' AND "lockedUntil" < NOW())
        )
        AND "runAfter" <= NOW()
        AND "attempts" < "maxAttempts"
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;

  return jobs[0] ?? null;
}

export async function finishQueuedJob(
  id: string,
  status: Exclude<QueuedJobStatus, 'pending' | 'running'>,
  result?: unknown,
  error?: unknown
) {
  return prisma.jobQueue.update({
    where: {
      id
    },
    data: {
      status,
      result: result == null ? undefined : JSON.stringify(result),
      error: error instanceof Error
        ? `${error.message}\n${error.stack ?? ''}`
        : error
          ? String(error)
          : undefined,
      finishedAt: new Date(),
      lockedBy: null,
      lockedUntil: null
    }
  });
}

export async function retryQueuedJob(
  job: JobQueue,
  error: unknown,
  retryDelayMs = env.WORKER_POLL_MS
) {
  const finalAttempt = job.attempts >= job.maxAttempts;

  if (finalAttempt) {
    await finishQueuedJob(
      job.id,
      'failed',
      undefined,
      error
    );
    return;
  }

  const retryBackoffMs = retryDelayMs * Math.max(1, 2 ** Math.max(0, job.attempts - 1));

  await prisma.jobQueue.update({
    where: {
      id: job.id
    },
    data: {
      status: 'pending',
      error: error instanceof Error
        ? `${error.message}\n${error.stack ?? ''}`
        : error
          ? String(error)
          : undefined,
      runAfter: new Date(Date.now() + retryBackoffMs),
      lockedBy: null,
      lockedUntil: null
    }
  });
}

export async function getQueueHealth(now = new Date()) {
  const [
    statusRows,
    oldestPendingJob,
    staleRunningJobs,
    failedJobs,
    runningJobs
  ] = await Promise.all([
    prisma.jobQueue.groupBy({
      by: ['status'],
      _count: {
        _all: true
      }
    }),
    prisma.jobQueue.findFirst({
      where: {
        status: 'pending'
      },
      orderBy: {
        createdAt: 'asc'
      }
    }),
    prisma.jobQueue.count({
      where: {
        status: 'running',
        lockedUntil: {
          lt: now
        }
      }
    }),
    prisma.jobQueue.count({
      where: {
        status: 'failed'
      }
    }),
    prisma.jobQueue.count({
      where: {
        status: 'running'
      }
    })
  ]);
  const statuses = Object.fromEntries(
    statusRows.map((row) => [row.status, row._count._all])
  );
  const oldestPendingAgeSeconds = oldestPendingJob
    ? Math.max(
        0,
        Math.floor((now.getTime() - oldestPendingJob.createdAt.getTime()) / 1000)
      )
    : 0;

  return {
    generatedAt: now,
    statuses,
    pendingJobs: statuses.pending ?? 0,
    runningJobs,
    staleRunningJobs,
    failedJobs,
    oldestPendingAgeSeconds
  };
}

export async function retryFailedQueuedJob(
  id: string,
  now = new Date()
) {
  return prisma.jobQueue.updateMany({
    where: {
      id,
      status: 'failed'
    },
    data: {
      status: 'pending',
      runAfter: now,
      lockedBy: null,
      lockedUntil: null,
      finishedAt: null,
      error: null,
      maxAttempts: {
        increment: 1
      }
    }
  });
}

export async function requeueStaleRunningJobs(now = new Date()) {
  return prisma.jobQueue.updateMany({
    where: {
      status: 'running',
      lockedUntil: {
        lt: now
      }
    },
    data: {
      status: 'pending',
      runAfter: now,
      lockedBy: null,
      lockedUntil: null
    }
  });
}

export function createWorkerId(prefix = 'worker') {
  return `${prefix}-${process.pid}-${crypto.randomUUID()}`;
}
