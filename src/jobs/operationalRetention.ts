import { prisma } from '../db/prisma';
import { env } from '../config/env';

type RetentionResult = {
  auditLogs: number;
  jobRuns: number;
  jobQueue: number;
  feedQualitySnapshots: number;
};

function cutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function runOperationalRetention(): Promise<RetentionResult> {
  const [
    auditLogs,
    jobRuns,
    jobQueue,
    feedQualitySnapshots
  ] = await Promise.all([
    prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoff(env.AUDIT_LOG_RETENTION_DAYS)
        }
      }
    }),
    prisma.jobRun.deleteMany({
      where: {
        startedAt: {
          lt: cutoff(env.JOB_RUN_RETENTION_DAYS)
        }
      }
    }),
    prisma.jobQueue.deleteMany({
      where: {
        createdAt: {
          lt: cutoff(env.JOB_QUEUE_RETENTION_DAYS)
        },
        status: {
          in: ['success', 'failed']
        }
      }
    }),
    prisma.feedQualitySnapshot.deleteMany({
      where: {
        createdAt: {
          lt: cutoff(env.FEED_QUALITY_RETENTION_DAYS)
        }
      }
    })
  ]);

  return {
    auditLogs: auditLogs.count,
    jobRuns: jobRuns.count,
    jobQueue: jobQueue.count,
    feedQualitySnapshots: feedQualitySnapshots.count
  };
}

export function summarizeOperationalRetention(result: RetentionResult) {
  return [
    `auditLogs=${result.auditLogs}`,
    `jobRuns=${result.jobRuns}`,
    `jobQueue=${result.jobQueue}`,
    `feedQualitySnapshots=${result.feedQualitySnapshots}`
  ].join(', ');
}
