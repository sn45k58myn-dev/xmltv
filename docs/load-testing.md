# Load Testing And Feed Benchmarks

Run load tests against a production-like environment, not a developer laptop,
when making capacity decisions. Use representative cached feeds and run imports
outside the test window unless the goal is specifically to test contention.

## Local Benchmark

Use the built-in benchmark for quick before/after checks:

```bash
npm run benchmark:feeds
```

Useful environment variables:

```bash
BENCHMARK_BASE_URL=http://localhost:3001
BENCHMARK_ENDPOINTS=/health,/ready,/manifest.json,/api/discovery/metadata
BENCHMARK_REQUESTS=5
BENCHMARK_TIMEOUT_MS=30000
```

The script reports status codes, response bytes, average latency, p95 latency,
and max latency for each endpoint. It exits non-zero if any request returns a
non-2xx status.

Protected feed endpoints need public exports enabled or an export token:

```bash
BENCHMARK_EXPORT_TOKEN="$EXPORT_TOKEN" \
BENCHMARK_ENDPOINTS=/country/GB.xml.gz,/provider/example.xml.gz \
npm run benchmark:feeds
```

## k6 Load Test

Install k6 and run:

```bash
k6 run scripts/k6-feed-load.js
```

Example with a target host and larger load:

```bash
BASE_URL=https://xmltv.example.com \
K6_ENDPOINTS=/health,/ready,/manifest.json,/api/discovery/metadata \
K6_TARGET_VUS=25 \
K6_HOLD=5m \
k6 run scripts/k6-feed-load.js
```

Protected feed endpoints need an export token:

```bash
BASE_URL=https://xmltv.example.com \
K6_EXPORT_TOKEN="$EXPORT_TOKEN" \
K6_ENDPOINTS=/country/GB.xml.gz,/provider/example.xml.gz \
k6 run scripts/k6-feed-load.js
```

The included k6 script uses conservative thresholds:

```text
http_req_failed rate < 1%
http_req_duration p95 < 1000ms
```

Tune these thresholds to match the deployment's service level objectives.

## Suggested Test Matrix

Run each test after warming the feed cache:

```bash
curl http://localhost:3001/manifest.json
curl -H "x-export-token: $EXPORT_TOKEN" http://localhost:3001/country/GB.xml.gz --output /dev/null
curl http://localhost:3001/api/discovery/metadata
```

Recommended scenarios:

| Scenario | Purpose |
| --- | --- |
| Smoke, 1-5 VUs for 1 minute | Confirm deployment, TLS, proxy, and auth basics |
| Baseline, expected peak VUs for 5-15 minutes | Establish normal p95/p99 latency and CPU/memory |
| Large feed download, gzip endpoint focused | Validate network throughput and response streaming |
| Metadata and dashboard endpoints | Watch database and cache metadata query cost |
| Queue mode manual import during read load | Confirm feed serving remains responsive during imports |

## What To Watch

- `/monitoring/metrics` request counts, latency buckets, memory, and latest import.
- `/ready` failures during imports or high request volume.
- Reverse proxy 499/502/504 counts.
- PostgreSQL CPU, connections, slow queries, and lock waits.
- Disk usage for `cache/`, PostgreSQL data, backups, and logs.
- App process RSS memory while serving large XML and GZip feeds.

## Large Feed Notes

- Prefer `.xml.gz` feed URLs for consumers that support compression.
- Keep `FEED_CACHE_MAX_AGE_SECONDS` aligned with feed freshness needs.
- Use `CACHE_METADATA_STORE=redis` for large cache directories or multiple app
  replicas.
- Use `IMPORT_RUN_MODE=queue` for manual imports that would otherwise hold an
  HTTP request open for too long.
- Avoid running destructive restore drills or migration tests against the same
  database used for load testing.

## Recording A Baseline

Save the output of:

```bash
npm run benchmark:feeds
curl http://localhost:3001/monitoring/metrics
curl http://localhost:3001/api/discovery/metadata
```

Record:

- app version and Git SHA
- database size
- channel and programme counts
- cache feed count and total cache size
- instance CPU and memory
- test endpoint list, VUs, duration, p95, max latency, and error rate
