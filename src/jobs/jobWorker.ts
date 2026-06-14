import { env } from '../config/env';
import { runTrackedJob } from './jobRuns';
import {
  claimNextJob,
  createWorkerId,
  finishQueuedJob,
  retryQueuedJob
} from './jobQueue';
import { runEnabledImports, summarizeImportResults } from './importWork';
import { runWebGrabImport, summarizeWebGrabResult } from '../services/webgrabRunner';

type QueuedJobContext = {
  actor?: string | null;
  requestId?: string | null;
};

function parseQueuedJobContext(payload: string | null) {
  if (!payload) {
    return {};
  }

  try {
    const parsed = JSON.parse(payload) as QueuedJobContext;

    return {
      actor: parsed?.actor ?? null,
      requestId: parsed?.requestId ?? null
    };
  } catch {
    return {};
  }
}

async function runQueuedJob(job: Awaited<ReturnType<typeof claimNextJob>>) {
  if (!job) return;
  const context = parseQueuedJobContext(job.payload);

  if (job.type === 'manual-imports') {
    const result = await runTrackedJob(
      'manual-imports',
      'queue',
      runEnabledImports,
      summarizeImportResults,
      context
    );

    await finishQueuedJob(
      job.id,
      'success',
      result
    );
    return;
  }

  if (job.type === 'webgrab-run') {
    const result = await runTrackedJob(
      'webgrab-run',
      'queue',
      runWebGrabImport,
      summarizeWebGrabResult,
      context
    );

    await finishQueuedJob(
      job.id,
      'success',
      result
    );
    return;
  }

  throw new Error(`Unknown queued job type: ${job.type}`);
}

export async function processNextQueuedJob(workerId = createWorkerId()) {
  const job = await claimNextJob(workerId);

  if (!job) return null;

  try {
    await runQueuedJob(job);
  } catch (error) {
    await retryQueuedJob(
      job,
      error
    );
  }

  return job;
}

export function startJobWorker() {
  if (env.ENABLE_WORKER !== 'true') {
    return undefined;
  }

  const workerId = createWorkerId();
  let running = false;
  let activeJob: Promise<void> | undefined;

  console.log(`Job worker started: ${workerId}`);

  const tick = () => {
    if (running) return;

    running = true;
    activeJob = processNextQueuedJob(workerId)
      .then(() => undefined)
      .catch((error) => {
        console.error('Job worker failed while processing queue:', error);
      })
      .finally(() => {
        running = false;
        activeJob = undefined;
      });
  };

  tick();

  const interval = setInterval(
    tick,
    env.WORKER_POLL_MS
  );

  interval.unref?.();

  return async () => {
    clearInterval(interval);

    if (!activeJob) {
      return;
    }

    let timeout: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        activeJob,
        new Promise<void>((resolve) => {
          timeout = setTimeout(
            resolve,
            env.WORKER_SHUTDOWN_TIMEOUT_MS
          );
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };
}
