import { prisma } from '../db/prisma';

type JobStatus = 'running' | 'success' | 'failed' | 'skipped';

export async function startJobRun(
  name: string,
  trigger: string
) {
  return prisma.jobRun.create({
    data: {
      name,
      trigger,
      status: 'running'
    }
  });
}

export async function finishJobRun(
  id: string,
  status: JobStatus,
  summary?: string,
  error?: unknown
) {
  const finishedAt = new Date();
  const existing = await prisma.jobRun.findUnique({
    where: {
      id
    },
    select: {
      startedAt: true
    }
  });

  return prisma.jobRun.update({
    where: {
      id
    },
    data: {
      status,
      summary,
      error: error instanceof Error
        ? `${error.message}\n${error.stack ?? ''}`
        : error
          ? String(error)
          : undefined,
      finishedAt,
      durationMs: existing
        ? finishedAt.getTime() - existing.startedAt.getTime()
        : undefined
    }
  });
}

export async function runTrackedJob<T>(
  name: string,
  trigger: string,
  runner: () => Promise<T>,
  summarize: (result: T) => string = () => 'completed'
) {
  const job = await startJobRun(
    name,
    trigger
  );

  try {
    const result = await runner();

    await finishJobRun(
      job.id,
      'success',
      summarize(result)
    );

    return result;
  } catch (error) {
    await finishJobRun(
      job.id,
      'failed',
      undefined,
      error
    );

    throw error;
  }
}
