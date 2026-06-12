import { NextFunction, Request, Response } from 'express';

type RouteMetric = {
  count: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

const routeMetrics = new Map<string, RouteMetric>();
const recentDurations: number[] = [];
const statusBuckets: Record<string, number> = {};

let totalRequests = 0;
let totalErrors = 0;
let inFlight = 0;

function routeKey(req: Request) {
  const routePath = req.route?.path;
  const baseUrl = req.baseUrl ?? '';

  if (typeof routePath === 'string') {
    return `${req.method} ${baseUrl}${routePath}`;
  }

  return `${req.method} ${req.path}`;
}

function statusBucket(statusCode: number) {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  if (statusCode >= 200) return '2xx';
  return '1xx';
}

function percentile(
  values: number[],
  percentileValue: number
) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;

  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function requestMetrics(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const started = process.hrtime.bigint();
  inFlight += 1;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const key = routeKey(req);
    const metric = routeMetrics.get(key) ?? {
      count: 0,
      errors: 0,
      totalDurationMs: 0,
      maxDurationMs: 0
    };

    totalRequests += 1;
    inFlight = Math.max(0, inFlight - 1);
    metric.count += 1;
    metric.totalDurationMs += durationMs;
    metric.maxDurationMs = Math.max(metric.maxDurationMs, durationMs);

    if (res.statusCode >= 500) {
      totalErrors += 1;
      metric.errors += 1;
    }

    const bucket = statusBucket(res.statusCode);
    statusBuckets[bucket] = (statusBuckets[bucket] ?? 0) + 1;
    recentDurations.push(durationMs);

    if (recentDurations.length > 500) {
      recentDurations.shift();
    }

    routeMetrics.set(key, metric);
  });

  next();
}

export function getRequestMetrics() {
  const routes = Array.from(routeMetrics.entries())
    .map(([route, metric]) => ({
      route,
      requests: metric.count,
      errors: metric.errors,
      averageMs: Number((metric.totalDurationMs / metric.count).toFixed(2)),
      maxMs: Number(metric.maxDurationMs.toFixed(2))
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 20);

  return {
    totalRequests,
    inFlight,
    totalErrors,
    errorRate: totalRequests === 0
      ? 0
      : Number((totalErrors / totalRequests).toFixed(4)),
    statusBuckets,
    latency: {
      p50Ms: Number(percentile(recentDurations, 50).toFixed(2)),
      p95Ms: Number(percentile(recentDurations, 95).toFixed(2)),
      p99Ms: Number(percentile(recentDurations, 99).toFixed(2))
    },
    routes
  };
}
