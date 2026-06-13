import { env } from '../config/env';
import { runTrackedJob } from './jobRuns';
import {
  claimNextJob,
  createWorkerId,
  finishQueuedJob,
  retryQueuedJob
} from './jobQueue';
import { runEnabledImports, summarizeImportResults } from './importWork';

async function runQueuedJob(job: Awaited<ReturnType<typeof claimNextJob>>) {
  if (!job) return;

  if (job.type === 'manual-imports') {
    const result = await runTrackedJob(
      'manual-imports',
      'queue',
      runEnabledImports,
      summarizeImportResults
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
    return;
  }

  const workerId = createWorkerId();
  let running = false;

  console.log(`Job worker started: ${workerId}`);

  const tick = () => {
    if (running) return;

    running = true;
    void processNextQueuedJob(workerId)
      .catch((error) => {
        console.error('Job worker failed while processing queue:', error);
      })
      .finally(() => {
        running = false;
      });
  };

  tick();

  const interval = setInterval(
    tick,
    env.WORKER_POLL_MS
  );

  interval.unref?.();
}
