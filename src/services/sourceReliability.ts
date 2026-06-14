import { env } from '../config/env';
import { prisma } from '../db/prisma';

type SourceForReliability = {
  id: string;
  name: string;
  type?: string;
  enabled?: boolean;
};

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

async function sourceFailureStreak(sourceId: string) {
  const take = Math.max(
    env.SOURCE_AUTO_DISABLE_FAILURES,
    1
  );
  const healthRows = await prisma.sourceHealth.findMany({
    where: {
      sourceId
    },
    orderBy: {
      checkedAt: 'desc'
    },
    take
  });
  let failures = 0;

  for (const row of healthRows) {
    if (row.status !== 'failed') {
      break;
    }

    failures++;
  }

  return failures;
}

export async function recordSourceFailure(
  source: SourceForReliability,
  message: string
) {
  const health = await prisma.sourceHealth.create({
    data: {
      sourceId: source.id,
      status: 'failed',
      message
    }
  });
  let disabled = false;
  let failureStreak = 0;

  if (env.SOURCE_AUTO_DISABLE_FAILURES > 0) {
    failureStreak = await sourceFailureStreak(source.id);

    if (failureStreak >= env.SOURCE_AUTO_DISABLE_FAILURES && source.enabled !== false) {
      await prisma.source.update({
        where: {
          id: source.id
        },
        data: {
          enabled: false
        }
      });
      disabled = true;

      await prisma.auditLog.create({
        data: {
          action: 'source.auto_disable',
          entityType: 'Source',
          entityId: source.id,
          actor: 'system:source-reliability',
          metadata: JSON.stringify({
            name: source.name,
            type: source.type,
            failureStreak,
            threshold: env.SOURCE_AUTO_DISABLE_FAILURES,
            reason: message
          })
        }
      }).catch((error) => {
        console.error('Unable to record source auto-disable audit event:', error);
      });
    }
  }

  return {
    health,
    disabled,
    failureStreak
  };
}
