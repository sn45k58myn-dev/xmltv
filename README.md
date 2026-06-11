# XMLTV Aggregator

A Node.js/TypeScript XMLTV EPG service that imports multiple guide sources, validates XMLTV, normalizes channels, deduplicates programs, matches aliases, stores everything in SQLite via Prisma, and exposes XMLTV export feeds.

## Core services

```text
XMLTV Sources
├── epg.pw
├── IPTV-Org
├── Schedules Direct adapter placeholder
├── Custom XMLTV URLs
└── User uploads

Processing Pipeline
Fetch
  ↓
Validate XMLTV
  ↓
Normalize channels
  ↓
Deduplicate
  ↓
Match aliases
  ↓
Store
  ↓
Generate exports

Database
Channel
Program
Alias
Source
ImportRun
Mapping
ExportProfile

Exports
/uk.xml
/us.xml
/sports.xml
/movies.xml
/profile/:id.xml
/provider/:id.xml
```

## Quick start

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run dev
```

The default Prisma datasource is PostgreSQL. The example `.env` points at
`postgresql://xmltv:xmltv@localhost:5432/xmltv?schema=public`; update it if
your database credentials differ.

Run imports:

```bash
curl -X POST http://localhost:3000/imports/run
```

Upload a local XMLTV file:

```bash
curl -F "xmltv=@guide.xml" http://localhost:3000/imports/upload
```

Open exports:

```bash
http://localhost:3000/uk.xml
http://localhost:3000/us.xml
http://localhost:3000/sports.xml
http://localhost:3000/movies.xml
http://localhost:3000/profile/:id.xml
http://localhost:3000/provider/:id.xml
```

## Custom XMLTV URLs

Add comma-separated XMLTV URLs to `.env`:

```env
CUSTOM_XMLTV_URLS=https://example.com/one.xml,https://example.com/two.xml
```

## Export windows

Country, category, profile, and provider exports include programmes that overlap
the configured export window. Set these values in `.env`:

```env
EXPORT_PAST_HOURS=12
EXPORT_FUTURE_DAYS=7
```

## Schedules Direct

`Schedules Direct` is scaffolded as a source type, but the token/login and lineup conversion is intentionally isolated in `src/sources/fetchers.ts`. Add your account credentials to `.env`, implement the adapter, and return XMLTV text to feed the same parser/pipeline.

## Notes

- Deduplication uses a unique database constraint on `channelId + start + stop + checksum`.
- Alias matching normalizes channel names by removing common quality/country suffixes.
- Provider exports use `Mapping` records to decide which internal channels belong to a provider.
- Profile exports use `ExportProfile` filters and optional explicit channel ID lists.


## Admin UI

Open `http://localhost:3000/admin` and enter `ADMIN_TOKEN` from your environment. The UI includes:

- Sources management
- Import run history
- Analytics dashboard
- Coverage view
- Channel mapping and aliases
- Export profiles
- Export token generation
- Monitoring dashboard

## Discovery and operations APIs

- `GET /api/docs` returns a machine-readable endpoint catalogue.
- `GET /api/discovery/manifest` returns the full feed manifest.
- `GET /api/discovery/countries` lists country feeds.
- `GET /api/discovery/providers` lists provider feeds from channel mappings.
- `GET /api/discovery/metadata` returns cache and feed metadata.
- `GET /api/discovery/validation` validates cached XMLTV feeds.
- `GET /api/stats/dashboard` returns dashboard analytics.

Debug routes are disabled by default. Set `ENABLE_DEBUG_ROUTES=true` and send
`x-admin-token` to access `/debug/channels` and `/debug/programs`.

## Production Docker

The Docker image builds TypeScript, generates the Prisma client, prunes dev
dependencies, runs as the non-root `node` user, and exposes a `/health`
healthcheck. `docker-compose.yml` includes a PostgreSQL 16 service and persists
database, cache, data, and upload directories.

```bash
docker compose up --build
```

## v3.0.0 release checklist

- Dynamic manifest, country, and provider discovery endpoints are available.
- Cached feed metadata and validation endpoints are available.
- Admin analytics page is available.
- Package version is read from `package.json` for manifests and docs.
- Debug routes are production-hardened behind an explicit flag and admin token.
- CI runs install, Prisma generate, TypeScript build, import smoke test, and audit.
- Production Docker image is multi-stage and non-root.

## Premium feature modules

The repo now includes production-ready extension points for:

- Multi-source merge with source merge weights
- Automatic alias generation
- Catch-up metadata fields in XMLTV exports
- TMDB enrichment for programme images and series metadata
- Channel logos and images
- Export tokens for private XML feeds
- In-memory rate limiting middleware

Set `PUBLIC_EXPORTS=true` for open feeds, or keep it false and pass `?token=<export-token>` to `/uk.xml`, `/us.xml`, `/sports.xml`, `/movies.xml`, `/profile/:id.xml`, and `/provider/:id.xml`.
