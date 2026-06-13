import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

type AcquiredJobLock = {
  name: string;
  owner: string;
  release: () => Promise<void>;
};

function lockUntil(ttlMs: number) {
  return new Date(Date.now() + ttlMs);
}

export async function acquireJobLock(
  name: string,
  ttlMs: number
): Promise<AcquiredJobLock | null> {
  const owner = crypto.randomUUID();
  const lockedUntil = lockUntil(ttlMs);

  try {
    await prisma.jobLock.create({
      data: {
        name,
        owner,
        lockedUntil
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }

    const result = await prisma.jobLock.updateMany({
      where: {
        name,
        lockedUntil: {
          lt: new Date()
        }
      },
      data: {
        owner,
        lockedUntil
      }
    });

    if (result.count === 0) {
      return null;
    }
  }

  return {
    name,
    owner,
    release: async () => {
      await prisma.jobLock.updateMany({
        where: {
          name,
          owner
        },
        data: {
          owner: null,
          lockedUntil: new Date(0)
        }
      });
    }
  };
}
