import { prisma } from '../db/prisma';

export async function getSourceCache(sourceId: string) {
  return prisma.sourceCache.findUnique({
    where: {
      sourceId
    }
  });
}

export async function updateSourceCache(
  sourceId: string,
  etag?: string,
  lastModified?: string
) {
  return prisma.sourceCache.upsert({
    where: {
      sourceId
    },
    create: {
      sourceId,
      etag,
      lastModified
    },
    update: {
      etag,
      lastModified
    }
  });
}
