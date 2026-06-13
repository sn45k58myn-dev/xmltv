import crypto from 'node:crypto';
import { JobQueue } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';

type QueuedJobStatus = 'pending' | 'running' | 'success' | 'failed';

export async function enqueueJob(
  type: string,
  payload?: unknown,
  options: {
    maxAttempts?: number;
    runAfter?: Date;
  } = {}
) {
  return prisma.jobQueue.create({
    data: {
      type,
      payload: payload == null ? undefined : JSON.stringify(payload),
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
      runAfter: new Date(Date.now() + retryDelayMs),
      lockedBy: null,
      lockedUntil: null
    }
  });
}

export function createWorkerId(prefix = 'worker') {
  return `${prefix}-${process.pid}-${crypto.randomUUID()}`;
}
