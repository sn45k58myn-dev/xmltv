# XMLTV Aggregator

Node.js/TypeScript XMLTV EPG aggregation service for importing guide sources,
normalizing channels, deduplicating programmes, enriching metadata, and exposing
country, category, profile, and provider XMLTV feeds.

Version: `3.0.0`

## Features

- PostgreSQL storage through Prisma
- XMLTV import, validation, normalization, and deduplication
- Dynamic country feed discovery for any imported country
- Provider feed discovery from channel mappings
- Cached `.xml` and `.xml.gz` country feeds
- Export profiles and private export tokens
- Admin dashboard with analytics, coverage, source management, mappings, profiles, tokens, monitoring, and source categories
- Channel metadata backfill from local rules and IPTV-org channel metadata
- Feed validation and feed metadata APIs
- Production Docker image and GitHub Actions CI

## Architecture

```text
XMLTV sources
  - epg.pw
  - IPTV-org metadata enrichment
  - Schedules Direct adapter placeholder
  - Custom XMLTV URLs
  - User uploads

Pipeline
  Fetch
  Validate XMLTV
  Normalize channels
  Enrich channel metadata
  Deduplicate programmes
  Match aliases
  Store in PostgreSQL
  Rebuild cached feeds

Exports
  /country/:country.xml
  /country/:country.xml.gz
  /sports.xml
  /movies.xml
  /profile/:id.xml
  /provider/:id.xml
```

## Quick Start

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run build
npm start
```

Open:

```text
http://localhost:3000/admin
```

Use the `ADMIN_TOKEN` from `.env`.

## Environment

The default datasource is PostgreSQL:

```env
DATABASE_URL="postgresql://xmltv:xmltv@localhost:5432/xmltv?schema=public"
PORT=3000
BASE_URL=http://localhost:3000
ADMIN_TOKEN=dev-admin-token
PUBLIC_EXPORTS=false
EXPORT_PAST_HOURS=12
EXPORT_FUTURE_DAYS=7
ENABLE_DEBUG_ROUTES=false
```

Set `PUBLIC_EXPORTS=true` for open feeds. Otherwise pass
`?token=<export-token>` to protected feeds.

## Imports

Run the configured imports:

```bash
npm run import
```

Upload a local XMLTV file:

```bash
curl -F "xmltv=@guide.xml" http://localhost:3000/imports/upload
```

Add custom XMLTV URLs:

```env
CUSTOM_XMLTV_URLS=https://example.com/one.xml,https://example.com/two.xml
```

## Metadata And Categories

The imported XMLTV files may not include channel or programme categories. The
service supports two enrichment passes:

```bash
npm run metadata:backfill
npm run metadata:iptv-org
```

`metadata:backfill` uses local channel-name rules and source hints.

`metadata:iptv-org` downloads the public IPTV-org channel catalogue and fills
missing categories by matching channel names, alternate names, and country.

After imports, run:

```bash
npm run metadata:backfill
npm run metadata:iptv-org
npm run import
```

The admin `Categories` tab shows categories grouped by source.

## Admin UI

The admin dashboard is available at:

```text
http://localhost:3000/admin
```

It includes:

- Dashboard summary
- Analytics
- Categories by source
- Source management
- Import run history
- Coverage view
- Channel mapping
- Channel merge tools
- Alias generation
- Export profiles
- Export tokens
- Monitoring

## Discovery APIs

```text
GET /api/docs
GET /api/discovery/manifest
GET /api/discovery/countries
GET /api/discovery/providers
GET /api/discovery/metadata
GET /api/discovery/validation
GET /api/stats/dashboard
```

## Feed URLs

```text
GET /country/:country.xml
GET /country/:country.xml.gz
GET /sports.xml
GET /movies.xml
GET /profile/:id.xml
GET /provider/:id.xml
```

Legacy redirects:

```text
/uk.xml -> /country/GB.xml
/us.xml -> /country/US.xml
```

## Export Windows

Country, category, profile, and provider exports include programmes that overlap
the configured export window:

```env
EXPORT_PAST_HOURS=12
EXPORT_FUTURE_DAYS=7
```

## Docker

```bash
docker compose up --build
```

The compose stack includes PostgreSQL 16 and the production app image. The image
builds TypeScript, generates the Prisma client, prunes development dependencies,
runs as the non-root `node` user, and exposes a `/health` healthcheck.

## Checks

```bash
npm run db:generate
npm run build
npm run smoke:import
npm audit
```

`npm run lint` requires an ESLint 9 flat config before it can be used in CI.

## Production Notes

- Debug routes are disabled by default.
- Set `ENABLE_DEBUG_ROUTES=true` only when needed.
- Debug routes require `x-admin-token`.
- Feed caches are rebuilt after imports.
- Provider exports use `Mapping` records.
- Profile exports use `ExportProfile` filters and optional explicit channel IDs.
- Package version is read from `package.json` for manifests and docs.

## Schedules Direct

Schedules Direct is scaffolded as a source type. The login/token and lineup
conversion should be implemented in `src/sources/fetchers.ts`, returning XMLTV
text into the existing parser and import pipeline.
