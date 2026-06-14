
import { prisma } from '../db/prisma';
import { getRequestMetrics } from './requestMetrics';
import { getFeedSizes } from '../services/feedMetrics';

export async function systemMetrics() {
  const [
    latestRun,
    failedRuns,
    channels,
    programs,
    importStatusRows,
    queueStatusRows,
    oldestPendingJob,
    failedQueueJobs,
    totalFeedDownloads,
    topFeeds,
    latestQualitySnapshot,
    feedSizes
  ] = await Promise.all([
    prisma.importRun.findFirst({ include: { source: true }, orderBy: { startedAt: 'desc' } }),
    prisma.importRun.count({ where: { status: 'failed' } }),
    prisma.channel.count(),
    prisma.program.count(),
    prisma.importRun.groupBy({
      by: ['status'],
      _count: {
        _all: true
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
    }),
    prisma.jobQueue.count({
      where: {
        status: 'failed'
      }
    }),
    prisma.feedDownload.aggregate({
      _sum: {
        downloads: true
      }
    }),
    prisma.feedDownload.findMany({
      orderBy: {
        downloads: 'desc'
      },
      take: 10
    }),
    prisma.feedQualitySnapshot.findFirst({
      orderBy: {
        createdAt: 'desc'
      }
    }),
    getFeedSizes()
  ]);
  const importStatuses = Object.fromEntries(
    importStatusRows.map((row) => [row.status, row._count._all])
  );
  const queueStatuses = Object.fromEntries(
    queueStatusRows.map((row) => [row.status, row._count._all])
  );
  const oldestPendingQueueJobAgeSeconds = oldestPendingJob
    ? Math.max(
        0,
        Math.floor((Date.now() - oldestPendingJob.createdAt.getTime()) / 1000)
      )
    : 0;

  return {
    ok: true,
    latestRun,
    failedRuns,
    channels,
    programs,
    importStatuses,
    queueStatuses,
    oldestPendingQueueJobAgeSeconds,
    failedQueueJobs,
    totalFeedDownloads: totalFeedDownloads._sum.downloads ?? 0,
    topFeeds,
    feedCount: feedSizes.length,
    totalCacheBytes: feedSizes.reduce((sum, feed) => sum + feed.bytes, 0),
    latestQualitySnapshot,
    uptimeSeconds: process.uptime(),
    memory: process.memoryUsage(),
    requests: getRequestMetrics()
  };
}

function metricLine(
  name: string,
  value: number,
  labels: Record<string, string> = {}
) {
  const renderedLabels = Object.entries(labels)
    .map(([key, labelValue]) => `${key}="${labelValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');

  return `${name}${renderedLabels ? `{${renderedLabels}}` : ''} ${value}`;
}

export async function prometheusMetrics() {
  const metrics = await systemMetrics();
  const lines = [
    '# HELP xmltv_up Whether the XMLTV service metrics endpoint is healthy.',
    '# TYPE xmltv_up gauge',
    metricLine('xmltv_up', metrics.ok ? 1 : 0),
    '# HELP xmltv_channels_total Number of channels in the database.',
    '# TYPE xmltv_channels_total gauge',
    metricLine('xmltv_channels_total', metrics.channels),
    '# HELP xmltv_programs_total Number of programs in the database.',
    '# TYPE xmltv_programs_total gauge',
    metricLine('xmltv_programs_total', metrics.programs),
    '# HELP xmltv_import_failed_runs_total Number of failed import runs.',
    '# TYPE xmltv_import_failed_runs_total gauge',
    metricLine('xmltv_import_failed_runs_total', metrics.failedRuns),
    '# HELP xmltv_import_runs_total Import runs by status.',
    '# TYPE xmltv_import_runs_total gauge',
    ...Object.entries(metrics.importStatuses).map(([status, count]) =>
      metricLine('xmltv_import_runs_total', Number(count), { status })
    ),
    '# HELP xmltv_job_queue_jobs Queue jobs by status.',
    '# TYPE xmltv_job_queue_jobs gauge',
    ...Object.entries(metrics.queueStatuses).map(([status, count]) =>
      metricLine('xmltv_job_queue_jobs', Number(count), { status })
    ),
    '# HELP xmltv_job_queue_oldest_pending_age_seconds Age of the oldest pending queue job.',
    '# TYPE xmltv_job_queue_oldest_pending_age_seconds gauge',
    metricLine('xmltv_job_queue_oldest_pending_age_seconds', metrics.oldestPendingQueueJobAgeSeconds),
    '# HELP xmltv_job_queue_failed_jobs Failed queue jobs retained in the database queue.',
    '# TYPE xmltv_job_queue_failed_jobs gauge',
    metricLine('xmltv_job_queue_failed_jobs', metrics.failedQueueJobs),
    '# HELP xmltv_feed_downloads_total Total generated feed downloads.',
    '# TYPE xmltv_feed_downloads_total counter',
    metricLine('xmltv_feed_downloads_total', metrics.totalFeedDownloads),
    '# HELP xmltv_feed_downloads_by_feed Generated feed downloads by feed key.',
    '# TYPE xmltv_feed_downloads_by_feed counter',
    ...metrics.topFeeds.map((feed) =>
      metricLine('xmltv_feed_downloads_by_feed', feed.downloads, { feed: feed.feedKey })
    ),
    '# HELP xmltv_cached_feeds Number of cached feed files.',
    '# TYPE xmltv_cached_feeds gauge',
    metricLine('xmltv_cached_feeds', metrics.feedCount),
    '# HELP xmltv_cache_bytes Total bytes used by cached feed files.',
    '# TYPE xmltv_cache_bytes gauge',
    metricLine('xmltv_cache_bytes', metrics.totalCacheBytes),
    '# HELP xmltv_latest_feed_quality_score Latest persisted feed quality score.',
    '# TYPE xmltv_latest_feed_quality_score gauge',
    metricLine(
      'xmltv_latest_feed_quality_score',
      metrics.latestQualitySnapshot?.score ?? 0,
      {
        feed: metrics.latestQualitySnapshot?.feedKey ?? 'none',
        grade: metrics.latestQualitySnapshot?.grade ?? 'none'
      }
    ),
    '# HELP xmltv_process_uptime_seconds Node.js process uptime.',
    '# TYPE xmltv_process_uptime_seconds gauge',
    metricLine('xmltv_process_uptime_seconds', metrics.uptimeSeconds),
    '# HELP xmltv_process_memory_bytes Node.js process memory usage.',
    '# TYPE xmltv_process_memory_bytes gauge',
    metricLine('xmltv_process_memory_bytes', metrics.memory.rss, { type: 'rss' }),
    metricLine('xmltv_process_memory_bytes', metrics.memory.heapUsed, { type: 'heap_used' }),
    metricLine('xmltv_process_memory_bytes', metrics.memory.heapTotal, { type: 'heap_total' }),
    '# HELP xmltv_http_requests_total HTTP requests handled by this process.',
    '# TYPE xmltv_http_requests_total counter',
    metricLine('xmltv_http_requests_total', metrics.requests.totalRequests),
    '# HELP xmltv_http_in_flight_requests HTTP requests currently in flight.',
    '# TYPE xmltv_http_in_flight_requests gauge',
    metricLine('xmltv_http_in_flight_requests', metrics.requests.inFlight),
    '# HELP xmltv_http_errors_total HTTP 5xx responses handled by this process.',
    '# TYPE xmltv_http_errors_total counter',
    metricLine('xmltv_http_errors_total', metrics.requests.totalErrors),
    '# HELP xmltv_http_responses_total HTTP responses handled by status bucket.',
    '# TYPE xmltv_http_responses_total counter',
    ...Object.entries(metrics.requests.statusBuckets).map(([status, count]) =>
      metricLine('xmltv_http_responses_total', Number(count), { status })
    ),
    '# HELP xmltv_http_latency_ms Recent HTTP latency percentiles in milliseconds.',
    '# TYPE xmltv_http_latency_ms gauge',
    metricLine('xmltv_http_latency_ms', metrics.requests.latency.p50Ms, { quantile: '0.50' }),
    metricLine('xmltv_http_latency_ms', metrics.requests.latency.p95Ms, { quantile: '0.95' }),
    metricLine('xmltv_http_latency_ms', metrics.requests.latency.p99Ms, { quantile: '0.99' })
  ];

  return `${lines.join('\n')}\n`;
}
