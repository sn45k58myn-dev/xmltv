import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions, JobsOptions } from 'bullmq';
import { env } from '../config/env';
import { runTrackedJob } from './jobRuns';
import { runEnabledImports, summarizeImportResults } from './importWork';
import { assertJobPayloadSize, assertKnownJobType } from './jobTypes';
import { runWebGrabImport, summarizeWebGrabResult } from '../services/webgrabRunner';

const QUEUE_NAME = 'xmltv-jobs';

let queue: Queue | null = null;

function redisConnection(): ConnectionOptions {
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is required when JOB_QUEUE_BACKEND=bullmq.');
  }

  const redisUrl = new URL(env.REDIS_URL);
  const db = redisUrl.pathname.replace('/', '');

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: db ? Number(db) : undefined,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined
  };
}

function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: redisConnection()
    });
  }

  return queue;
}

export async function enqueueBullJob(
  type: string,
  payload?: unknown,
  options: JobsOptions = {}
) {
  assertKnownJobType(type);
  assertJobPayloadSize(payload);

  const job = await getQueue().add(
    type,
    payload ?? {},
    {
      attempts: options.attempts ?? 3,
      backoff: options.backoff ?? {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: options.removeOnComplete ?? 1000,
      removeOnFail: options.removeOnFail ?? 1000,
      ...options
    }
  );

  return {
    id: String(job.id),
    type: job.name,
    status: 'queued'
  };
}

export function startBullJobWorker() {
  if (env.ENABLE_WORKER !== 'true' || env.JOB_QUEUE_BACKEND !== 'bullmq') {
    return undefined;
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === 'manual-imports') {
        return runTrackedJob(
          'manual-imports',
          'bullmq',
          runEnabledImports,
          summarizeImportResults
        );
      }

      if (job.name === 'webgrab-run') {
        return runTrackedJob(
          'webgrab-run',
          'bullmq',
          runWebGrabImport,
          summarizeWebGrabResult
        );
      }

      throw new Error(`Unknown BullMQ job type: ${job.name}`);
    },
    {
      connection: redisConnection(),
      concurrency: 1
    }
  );

  worker.on('completed', (job) => {
    console.log(JSON.stringify({
      event: 'bullmq.completed',
      queue: QUEUE_NAME,
      jobId: job.id,
      jobName: job.name
    }));
  });

  worker.on('failed', (job, error) => {
    console.error(JSON.stringify({
      event: 'bullmq.failed',
      queue: QUEUE_NAME,
      jobId: job?.id,
      jobName: job?.name,
      error: error.message
    }));
  });

  console.log(`BullMQ worker started: ${QUEUE_NAME}`);

  return async () => {
    await worker.close();
    await queue?.close();
  };
}
