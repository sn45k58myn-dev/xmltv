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
npm run db:generate
npm run db:push
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
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
TMDB_API_KEY=
PREMIUM_ENABLED=true
PROGRAM_RETENTION_DAYS=14
EXPORT_PAST_HOURS=12
EXPORT_FUTURE_DAYS=7
ENABLE_DEBUG_ROUTES=false
```

Important variables:

- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
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
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`: In-memory API rate limit.
- `PROGRAM_RETENTION_DAYS`: Removes old programme rows after this many days.
- `EXPORT_PAST_HOURS`: Past programme window included in generated feeds.
- `EXPORT_FUTURE_DAYS`: Future programme window included in generated feeds.
- `ENABLE_DEBUG_ROUTES`: Enables admin-protected debug routes when `true`.
- `TMDB_API_KEY`: Optional programme enrichment key.

## Database Setup

For local PostgreSQL:

```bash
npm run db:generate
npm run db:push
```

For Docker Compose PostgreSQL:

```bash
docker compose up -d postgres
npm run db:generate
npm run db:push
```

The Prisma schema is in `prisma/schema.prisma`.

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

Admin upload and profile mutation routes require `x-admin-token`.

URL source downloads retry transient failures using `SOURCE_FETCH_RETRIES` and
`SOURCE_RETRY_DELAY_MS`. Freshness checks only skip imports when the source
returns usable `ETag` or `Last-Modified` validators.

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
```

Metadata includes total cache size, feed count, XML/GZip type, update time, and
download counts where available.

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
```

The response includes import status, channel/program counts, uptime, process
memory, request totals, in-flight requests, status buckets, latency percentiles,
and top routes by request count.

## Discovery Endpoints

```text
GET /api/docs
GET /api/discovery/manifest
GET /api/discovery/countries
GET /api/discovery/providers
GET /api/discovery/metadata
GET /api/discovery/validation
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

Apply the database schema:

```bash
docker compose exec xmltv npx prisma db push
```

Follow logs:

```bash
docker compose logs -f xmltv
```

The production image builds TypeScript, generates Prisma client files, prunes
development dependencies, runs as the non-root `node` user, and exposes
`/health`.

## Production Notes

- Keep `PUBLIC_EXPORTS=false` unless feeds should be public.
- Use export tokens for feed consumers.
- Keep `ENABLE_DEBUG_ROUTES=false` in production.
- Rotate `ADMIN_TOKEN` before deployment.
- Set `CORS_ORIGIN` to the public admin origin instead of `*` where possible.
- Set `TRUST_PROXY=true` only behind a trusted reverse proxy.
- Persist `cache/`, `data/`, `uploads/`, and PostgreSQL data.
- Rebuild cached feeds after source or mapping changes by running imports.

## Final v3.0.0 Checklist

```bash
npm run build
npm run smoke:import
npm start
curl http://localhost:3000/health
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
