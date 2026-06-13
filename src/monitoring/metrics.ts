
import { prisma } from '../db/prisma';
import { getRequestMetrics } from './requestMetrics';

export async function systemMetrics() {
  const [latestRun, failedRuns, channels, programs] = await Promise.all([
    prisma.importRun.findFirst({ include: { source: true }, orderBy: { startedAt: 'desc' } }),
    prisma.importRun.count({ where: { status: 'failed' } }),
    prisma.channel.count(),
    prisma.program.count()
  ]);

  return {
    ok: true,
    latestRun,
    failedRuns,
    channels,
    programs,
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
    '# HELP xmltv_http_latency_ms Recent HTTP latency percentiles in milliseconds.',
    '# TYPE xmltv_http_latency_ms gauge',
    metricLine('xmltv_http_latency_ms', metrics.requests.latency.p50Ms, { quantile: '0.50' }),
    metricLine('xmltv_http_latency_ms', metrics.requests.latency.p95Ms, { quantile: '0.95' }),
    metricLine('xmltv_http_latency_ms', metrics.requests.latency.p99Ms, { quantile: '0.99' })
  ];

  return `${lines.join('\n')}\n`;
}
