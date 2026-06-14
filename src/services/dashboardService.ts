import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { getFeedDownloads } from './downloadMetrics';
import { getFeedSizes } from './feedMetrics';

function sourceName(run: {
  source?: {
    name?: string | null;
  } | null;
  sourceId?: string | null;
}) {
  return run.source?.name ?? run.sourceId ?? 'Unknown source';
}

export async function getDashboardStats() {
  const [
    channels,
    programs,
    aliases,
    sources,
    enabledSources,
    downloads,
    feedSizes,
    lastImport,
    recentImports,
    recentFailedImports,
    recentFailures,
    queueStatuses,
    oldestPendingJob
  ] = await Promise.all([
    prisma.channel.count(),
    prisma.program.count(),
    prisma.alias.count(),
    prisma.source.count(),
    prisma.source.count({
      where: {
        enabled: true
      }
    }),
    getFeedDownloads(),
    getFeedSizes(),
    prisma.importRun.findFirst({
      orderBy: {
        startedAt: 'desc'
      },
      include: {
        source: true
      }
    }),
    prisma.importRun.findMany({
      orderBy: {
        startedAt: 'desc'
      },
      include: {
        source: true
      },
      take: 20
    }),
    prisma.importRun.findMany({
      where: {
        status: 'failed'
      },
      orderBy: {
        startedAt: 'desc'
      },
      include: {
        source: true
      },
      take: 10
    }),
    prisma.importRun.count({
      where: {
        status: 'failed',
        startedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    }),
    prisma.jobQueue.groupBy({
      by: ['status'],
      _count: {
        _all: true
      }
    }),
    prisma.jobQueue.findFirst({
      where: {
        status: 'pending'
      },
      orderBy: {
        createdAt: 'asc'
      }
    })
  ]);

  const totalDownloads = downloads.reduce(
    (sum, row) => sum + row.downloads,
    0
  );
  const cacheSizeMB = Number(
    feedSizes.reduce((sum, feed) => sum + feed.megabytes, 0).toFixed(2)
  );
  const queueDepthByStatus = Object.fromEntries(
    queueStatuses.map((row) => [row.status, row._count._all])
  );
  const oldestPendingQueueJobAgeSeconds = oldestPendingJob
    ? Math.max(
        0,
        Math.floor((Date.now() - oldestPendingJob.createdAt.getTime()) / 1000)
      )
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    channels,
    programs,
    aliases,
    sources,
    enabledSources,
    totalDownloads,
    feedCount: feedSizes.length,
    cacheSizeMB,
    cacheWarning: cacheSizeMB >= env.CACHE_WARNING_MB
      ? `Cache size ${cacheSizeMB} MB exceeds warning threshold ${env.CACHE_WARNING_MB} MB`
      : null,
    cacheWarningThresholdMB: env.CACHE_WARNING_MB,
    recentFailures,
    queueDepthByStatus,
    oldestPendingQueueJobAgeSeconds,
    topFeeds: downloads.slice(0, 10),
    feeds: feedSizes,
    recentImports: recentImports.map((run) => ({
      id: run.id,
      source: sourceName(run),
      status: run.status,
      channelsSeen: run.channelsSeen,
      programsSeen: run.programsSeen,
      channelsCreated: run.channelsCreated,
      programsCreated: run.programsCreated,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errors: run.errors
    })),
    recentFailedImports: recentFailedImports.map((run) => ({
      id: run.id,
      source: sourceName(run),
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errors: run.errors
    })),
    lastImport,
    lastImportStatus: lastImport?.status,
    lastImportAt: lastImport?.finishedAt ?? lastImport?.startedAt
  };
}
