import { prisma } from '../db/prisma';
import { boundedLimit } from '../utils/limits';

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

export async function getFeedDownloads(limit = 1000) {
  return prisma.feedDownload.findMany({
    orderBy: { downloads: 'desc' },
    take: boundedLimit(limit, {
      defaultValue: 1000,
      max: 5000
    })
  });
}
