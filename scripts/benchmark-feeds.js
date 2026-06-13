require('dotenv/config');

const { performance: nodePerformance } = require('node:perf_hooks');

const baseUrl = process.env.BENCHMARK_BASE_URL || process.env.BASE_URL || 'http://localhost:3001';
const requests = Number(process.env.BENCHMARK_REQUESTS || 3);
const timeoutMs = Number(process.env.BENCHMARK_TIMEOUT_MS || 30000);
const exportToken = process.env.BENCHMARK_EXPORT_TOKEN;
const endpoints = (process.env.BENCHMARK_ENDPOINTS || [
  '/health',
  '/ready',
  '/manifest.json',
  '/api/discovery/metadata'
].join(','))
  .split(',')
  .map((endpoint) => endpoint.trim())
  .filter(Boolean);

if (!Number.isFinite(requests) || requests < 1) {
  console.error('BENCHMARK_REQUESTS must be a positive number');
  process.exit(1);
}

if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
  console.error('BENCHMARK_TIMEOUT_MS must be a positive number');
  process.exit(1);
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;

  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function request(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );
  const started = nodePerformance.now();

  try {
    const response = await fetch(new URL(endpoint, baseUrl), {
      signal: controller.signal,
      headers: {
        accept: '*/*',
        ...(exportToken ? { 'x-export-token': exportToken } : {})
      }
    });
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      ok: response.ok,
      status: response.status,
      bytes: buffer.length,
      ms: nodePerformance.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

async function benchmarkEndpoint(endpoint) {
  const results = [];

  for (let i = 0; i < requests; i++) {
    results.push(await request(endpoint));
  }

  const durations = results.map((result) => result.ms);
  const bytes = results.reduce((sum, result) => sum + result.bytes, 0);
  const failed = results.filter((result) => !result.ok).length;

  return {
    endpoint,
    requests,
    failed,
    statuses: Array.from(new Set(results.map((result) => result.status))).join(','),
    bytes,
    avgMs: Number((durations.reduce((sum, ms) => sum + ms, 0) / durations.length).toFixed(2)),
    p95Ms: Number(percentile(durations, 95).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2))
  };
}

async function main() {
  const summary = [];

  for (const endpoint of endpoints) {
    summary.push(await benchmarkEndpoint(endpoint));
  }

  console.table(summary);

  const failed = summary.filter((row) => row.failed > 0);

  if (failed.length) {
    console.error(JSON.stringify({
      ok: false,
      failed
    }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    endpoints: summary.length,
    requestsPerEndpoint: requests
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
