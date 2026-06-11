import { prisma } from '../db/prisma';

export async function recordFeedDownload(feedKey: string) {
  return prisma.feedDownload.upsert({
    where: { feedKey },
    create: {
      feedKey,
      downloads: 1,
      lastDownloaded: new Date()
    },
    update: {
      downloads: { increment: 1 },
      lastDownloaded: new Date()
    }
  });
}

export async function getFeedDownloads() {
  return prisma.feedDownload.findMany({
    orderBy: { downloads: 'desc' }
  });
}
