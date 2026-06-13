import { prisma } from '../db/prisma';

export async function recordFeedDownload(feedKey: string) {
  try {
    return await prisma.feedDownload.upsert({
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
  } catch (error) {
    console.error(`Unable to record feed download for ${feedKey}:`, error);
    return null;
  }
}

export async function getFeedDownloads() {
  return prisma.feedDownload.findMany({
    orderBy: { downloads: 'desc' }
  });
}
