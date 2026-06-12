# XMLTV Aggregator

Version: `3.0.0`

XMLTV Aggregator is a Node.js/TypeScript EPG platform for importing XMLTV
sources, normalizing channels, deduplicating programmes, enriching metadata, and
serving cached country, category, profile, and provider XMLTV feeds.

## v3 Highlights

- PostgreSQL persistence through Prisma
- Incremental XMLTV imports with source caching
- Dynamic country exports for any imported country
- Category, profile, and provider feed exports
- Cached `.xml` and `.xml.gz` feed files
- Export token protection for generated feeds
- Admin UI for analytics, sources, imports, mappings, profiles, and tokens
- Discovery, manifest, metadata, validation, and dashboard APIs
- Docker production image and GitHub Actions CI

## Install

```bash
git clone https://github.com/sn45k58myn-dev/xmltv.git
cd xmltv
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

Open the app:

```text
http://localhost:3000/admin
```

Use the `ADMIN_TOKEN` value from `.env` in the admin UI token field.

## Environment Variables

Copy `.env.example` to `.env` and adjust values for your machine or deployment.

```env
DATABASE_URL="postgresql://xmltv:xmltv@localhost:5432/xmltv?schema=public"
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
SCHEDULES_DIRECT_USERNAME=
SCHEDULES_DIRECT_PASSWORD=
SCHEDULES_DIRECT_COUNTRY=GBR
SCHEDULES_DIRECT_LINEUP=
CUSTOM_XMLTV_URLS=https://example.com/guide.xml

ADMIN_TOKEN=dev-admin-token
PUBLIC_EXPORTS=false
CORS_ORIGIN=*
JSON_BODY_LIMIT=1mb
UPLOAD_MAX_MB=200
TRUST_PROXY=false
SOURCE_FETCH_TIMEOUT_MS=60000
SOURCE_FETCH_RETRIES=2
SOURCE_RETRY_DELAY_MS=1000
SOURCE_HEAD_TIMEOUT_MS=10000
SOURCE_FAILURE_BACKOFF_MINUTES=30
IMPORT_TIMEOUT_MS=1800000
SCHEDULER_LOCK_TTL_MS=3600000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
TMDB_API_KEY=
PREMIUM_ENABLED=true
PROGRAM_RETENTION_DAYS=14
EXPORT_PAST_HOURS=12
EXPORT_FUTURE_DAYS=7
ENABLE_DEBUG_ROUTES=false
RUN_MIGRATIONS=false
BACKUP_DIR=backups
ENABLE_SCHEDULER=true
FEED_CACHE_MAX_AGE_SECONDS=300
CACHE_WARNING_MB=1024
VALIDATION_MAX_FEED_MB=250
VALIDATION_TIMEOUT_MS=30000
```

Important variables:

- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `NODE_ENV`: Set to `production` for deployed runtime safety checks.
- `PORT`: HTTP port exposed by the app.
- `BASE_URL`: Public URL shown in startup logs and docs.
- `CUSTOM_XMLTV_URLS`: Comma-separated XMLTV source URLs for custom imports.
- `ADMIN_TOKEN`: Required for admin UI/API mutations and protected admin APIs.
- `PUBLIC_EXPORTS`: Set to `true` to allow public feed access without tokens.
- `CORS_ORIGIN`: `*` or a comma-separated list of allowed browser origins.
- `JSON_BODY_LIMIT`: Maximum JSON request body size.
- `UPLOAD_MAX_MB`: Maximum XMLTV upload size in megabytes.
- `TRUST_PROXY`: Set to `true` when running behind a trusted reverse proxy.
- `SOURCE_FETCH_TIMEOUT_MS`: Timeout for XMLTV source downloads.
- `SOURCE_FETCH_RETRIES`: Retry count for transient XMLTV source download failures.
- `SOURCE_RETRY_DELAY_MS`: Base retry backoff delay for source downloads.
- `SOURCE_HEAD_TIMEOUT_MS`: Timeout for source freshness HEAD checks.
- `SOURCE_FAILURE_BACKOFF_MINUTES`: Scheduler skips a source for this long after its latest failed health check.
- `IMPORT_TIMEOUT_MS`: Maximum wall-clock time for one scheduled source import.
- `SCHEDULER_LOCK_TTL_MS`: Database job lock TTL for scheduled imports and retention jobs.
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`: In-memory API rate limit.
- `PROGRAM_RETENTION_DAYS`: Removes old programme rows after this many days.
- `EXPORT_PAST_HOURS`: Past programme window included in generated feeds.
- `EXPORT_FUTURE_DAYS`: Future programme window included in generated feeds.
- `ENABLE_DEBUG_ROUTES`: Enables admin-protected debug routes when `true`.
- `TMDB_API_KEY`: Optional programme enrichment key.
- `RUN_MIGRATIONS`: Set to `true` in Docker deployments to run `prisma migrate deploy` before app start.
- `BACKUP_DIR`: Directory used by database backup scripts.
- `ENABLE_SCHEDULER`: Set to `false` on non-primary replicas.
- `FEED_CACHE_MAX_AGE_SECONDS`: Cache-Control max-age for generated feed responses.
- `CACHE_WARNING_MB`: Dashboard warning threshold for generated cache size.
- `VALIDATION_MAX_FEED_MB`: Maximum cached feed file size parsed by full validation.
- `VALIDATION_TIMEOUT_MS`: Per-feed timeout guard for full validation.

## Database Setup

For production or release-candidate PostgreSQL:

```bash
npx prisma generate
npx prisma migrate deploy
```

For Docker Compose PostgreSQL, the app container can run migrations on startup
when `RUN_MIGRATIONS=true`:

```bash
docker compose up --build -d
```

For local development only, `npm run db:push` can sync an experimental schema
without creating migration files. Do not use `db:push` as the production release
path.

The Prisma schema is in `prisma/schema.prisma`; production schema changes belong
in `prisma/migrations/`.

## Imports

Run configured imports from `.env` and enabled sources:

```bash
npm run import
```

Run imports from the admin UI:

```text
Admin UI -> Dashboard -> Run imports
```

Upload a local XMLTV file:

```bash
curl -H "x-admin-token: dev-admin-token" \
  -F "xmltv=@guide.xml" \
  http://localhost:3000/imports/upload
```

Admin upload and profile mutation routes require `x-admin-token`. Uploaded
XMLTV files are rejected when empty, larger than `UPLOAD_MAX_MB`, or obviously
not XML before import parsing starts. Temporary upload files are removed after
success or failure.

URL source downloads retry transient failures using `SOURCE_FETCH_RETRIES` and
`SOURCE_RETRY_DELAY_MS`. Freshness checks only skip imports when the source
returns usable `ETag` or `Last-Modified` validators.

Scheduled imports use database-backed job locks so only one scheduler owner runs
the import or retention job at a time. A recent failed source health check causes
the scheduler to skip that source until `SOURCE_FAILURE_BACKOFF_MINUTES` has
elapsed. Each scheduled source import is also guarded by `IMPORT_TIMEOUT_MS`.

## Job Runs

The app records coarse job history in the `JobRun` table for scheduled imports,
manual imports, and program retention. Source-level import details remain in the
existing `ImportRun` table.

```text
GET /api/admin/jobs
```

The admin jobs endpoint requires `x-admin-token`.

## Metadata And Categories

When source XMLTV files do not provide useful channel or programme categories,
run enrichment passes:

```bash
npm run metadata:backfill
npm run metadata:iptv-org
npm run import
```

The admin `Categories` view shows category coverage grouped by source.

## Cached Feeds

Imports rebuild cached feeds under `cache/`.

Generated feeds include:

```text
cache/GB.xml
cache/GB.xml.gz
cache/US.xml
cache/US.xml.gz
cache/provider_<providerId>.xml
cache/provider_<providerId>.xml.gz
```

Metadata and validation:

```bash
curl http://localhost:3000/api/discovery/metadata
curl http://localhost:3000/api/discovery/validation
curl http://localhost:3000/api/discovery/quality
```

Metadata includes total cache size, feed count, XML/GZip type, update time, and
download counts where available.

`/api/discovery/validation` is intentionally lightweight for public use. It
returns cache metadata and points operators to the full admin validation route.
Full validation parses XML and compressed XML feeds, so it is protected behind
`/api/admin/validation` and guarded by `VALIDATION_MAX_FEED_MB` and
`VALIDATION_TIMEOUT_MS`.

Feed quality scores combine validation status, channel/program counts, cache
size, freshness, and download metadata. Scores are advisory and do not block
feed serving.

## Export Tokens

Generated feed routes are protected unless `PUBLIC_EXPORTS=true`.

When `PUBLIC_EXPORTS=false`, pass an active export token using either:

```text
?token=<export-token>
x-export-token: <export-token>
```

Create and manage export tokens in:

```text
Admin UI -> Export Tokens
```

Successful token use increments request counts and updates last-used time.

## Admin UI

```text
http://localhost:3000/admin
```

Main admin views:

- Dashboard analytics
- Feed metadata and validation
- Source management
- Import history and import runner
- Coverage
- Channel mapping and merging
- Alias generation
- Profiles
- Export tokens
- Monitoring
- Categories by source

The admin UI sends `x-admin-token` from the token input saved in local storage.

## Observability

Runtime monitoring is available at:

```text
GET /monitoring/metrics
GET /ready
```

The response includes import status, channel/program counts, uptime, process
memory, request totals, in-flight requests, status buckets, latency percentiles,
and top routes by request count.

`/ready` performs a lightweight database probe for load balancers and
orchestrators.

Every HTTP response includes an `x-request-id` header. If an upstream proxy sends
`x-request-id`, the app preserves it; otherwise it generates a UUID. Completed
requests are written as structured JSON logs with the request id, method, path,
status code, duration, client IP, and user agent so production logs can be
searched by request id.

The dashboard response includes `cacheWarning` and `cacheWarningThresholdMB`.
Set `CACHE_WARNING_MB` to match the storage budget for the deployment.

## Discovery Endpoints

```text
GET /ready
GET /api/docs
GET /api/discovery/manifest
GET /api/discovery/countries
GET /api/discovery/providers
GET /api/discovery/metadata
GET /api/discovery/validation
GET /api/discovery/quality
GET /api/stats/dashboard
```

## Manifest Endpoint

The public manifest endpoint is:

```text
GET /manifest.json
```

It exposes app/version metadata and available generated feeds, including country
feeds and provider feeds when mappings exist.

## Feed Endpoints

Protected generated feeds:

```text
GET /country/:country.xml
GET /country/:country.xml.gz
GET /sports.xml
GET /movies.xml
GET /profile/:id.xml
GET /provider/:id.xml
GET /provider/:id.xml.gz
```

Legacy redirects:

```text
/uk.xml -> /country/GB.xml
/us.xml -> /country/US.xml
```

## Docker Usage

Start the full stack:

```bash
cp .env.example .env
docker compose up --build -d
```

The compose file sets `RUN_MIGRATIONS=true`, so `npx prisma migrate deploy` runs
before the app starts. To apply migrations manually:

```bash
docker compose exec xmltv npx prisma migrate deploy
```

Follow logs:

```bash
docker compose logs -f xmltv
```

The production image builds TypeScript, generates Prisma client files, prunes
development-only dependencies, can run migrations on start when
`RUN_MIGRATIONS=true`, runs as the non-root `node` user, and exposes `/health`.

## Backup And Recovery

Database backups use `pg_dump` in custom format. The scripts require PostgreSQL
client tools on the machine running the command and read `DATABASE_URL` from the
environment.

Create a backup:

```bash
npm run backup:db
```

This runs `scripts/backup-postgres.js` and writes a timestamped `.dump` file to
`BACKUP_DIR`, defaulting to `backups/`.

Restore a backup:

```bash
npm run restore:db -- backups/xmltv-YYYYMMDDTHHMMSSZ.dump
```

This runs `scripts/restore-postgres.js`, which calls `pg_restore --clean
--if-exists`. Restores replace objects in the target database, so verify
`DATABASE_URL` before running it. `BACKUP_DIR` is ignored by git. Stop writers or
schedule backups during a quiet import window for the most consistent recovery
point.

## Production Notes

- Keep `PUBLIC_EXPORTS=false` unless feeds should be public.
- Use export tokens for feed consumers.
- Keep `ENABLE_DEBUG_ROUTES=false` in production.
- Set `NODE_ENV=production`; startup refuses the default `ADMIN_TOKEN` and
  local development database URLs in production mode.
- Rotate `ADMIN_TOKEN` before deployment and do not use `dev-admin-token`.
- Set `CORS_ORIGIN` to the public admin origin instead of `*` where possible.
- Set `TRUST_PROXY=true` only behind a trusted reverse proxy.
- Persist `cache/`, `data/`, `uploads/`, and PostgreSQL data.
- Rebuild cached feeds after source or mapping changes by running imports. Feed
  cache writes are atomic; old cache files remain available until replacements
  are fully written.
- In multi-container or multi-replica deployments, run `ENABLE_SCHEDULER=true`
  on only one scheduler owner and set it to `false` everywhere else.
- Generated feeds send `Cache-Control` using `FEED_CACHE_MAX_AGE_SECONDS`.
- Watch `cacheWarning` from `/api/stats/dashboard` and increase storage or prune
  generated cache files when the warning is present.
- The built-in rate limiter and request metrics are process-local; use external
  rate limiting and metrics aggregation when scaling horizontally.

## CI/CD

GitHub Actions runs on pushes to `main`, pull requests, and manual dispatch. The
workflow installs dependencies with `npm ci`, generates Prisma client files with
`npx prisma generate`, applies migrations with `npx prisma migrate deploy`,
verifies `migrate deploy` against a fresh PostgreSQL schema, builds TypeScript,
runs the smoke import, audits moderate vulnerabilities, and validates the Docker
production image build.

The v3 release currently has no moderate, high, or critical `npm audit`
findings. CI keeps `npm audit --audit-level=moderate` blocking so runtime and
build dependency vulnerabilities are caught early.

## Final v3.0.0 Checklist

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run smoke:import
npm start
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/manifest.json
curl http://localhost:3000/api/stats/dashboard
```

Before publishing the final tag:

```bash
git status
git tag -a v3.0.0 -m "v3.0.0"
git push origin v3.0.0
```

If `v3.0.0` already exists, verify it points at the intended final release commit
before moving it.

## Schedules Direct

Schedules Direct is scaffolded as a source type. The login/token and lineup
conversion should be completed in `src/sources/fetchers.ts`, returning XMLTV
text into the existing parser and import pipeline.
