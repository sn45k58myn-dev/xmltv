import { env } from '../config/env';
import { prisma } from '../db/prisma';

export async function withImportTimeout<T>(
  sourceName: string,
  task: Promise<T>
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Import timed out for ${sourceName} after ${env.IMPORT_TIMEOUT_MS} ms`));
    }, env.IMPORT_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      task,
      timeoutPromise
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function shouldBackoffSource(sourceId: string) {
  if (env.SOURCE_FAILURE_BACKOFF_MINUTES <= 0) {
    return false;
  }

  const latestHealth = await prisma.sourceHealth.findFirst({
    where: {
      sourceId
    },
    orderBy: {
      checkedAt: 'desc'
    }
  });

  if (latestHealth?.status !== 'failed') {
    return false;
  }

  const retryAfter = new Date(
    latestHealth.checkedAt.getTime() + env.SOURCE_FAILURE_BACKOFF_MINUTES * 60 * 1000
  );

  return retryAfter > new Date();
}
