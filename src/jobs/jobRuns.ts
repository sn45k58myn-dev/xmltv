import { prisma } from '../db/prisma';

type JobStatus = 'running' | 'success' | 'failed' | 'skipped';

type JobRunContext = {
  actor?: string | null;
  requestId?: string | null;
};

export async function startJobRun(
  name: string,
  trigger: string,
  context: JobRunContext = {}
) {
  return prisma.jobRun.create({
    data: {
      name,
      trigger,
      actor: context.actor ?? null,
      requestId: context.requestId ?? null,
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
  summarize: (result: T) => string = () => 'completed',
  context: JobRunContext = {}
) {
  const job = await startJobRun(
    name,
    trigger,
    context
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
