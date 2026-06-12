# XMLTV Aggregator v3.0.0 Release Notes

## Release Summary

v3.0.0 is the production-ready XMLTV platform release. It consolidates the v2
architecture into one PostgreSQL-backed aggregator with dynamic feed generation,
cached exports, provider discovery, protected feeds, admin analytics, and
release-grade deployment paths.

## Highlights

- PostgreSQL persistence through Prisma
- Incremental imports with source cache metadata
- Program retention and export time windows
- Dynamic country feeds for any imported country
- Category, profile, and provider feed exports
- Cached `.xml` and `.xml.gz` feeds
- Provider feed cache parity with `/provider/:id.xml` and `/provider/:id.xml.gz`
- Unified manifest and discovery services
- `/api/docs`, feed metadata, and feed validation endpoints
- Admin dashboard analytics, source management, profiles, and export token UI
- Real export token enforcement for generated feeds
- Protected admin mutation routes
- Download metrics for generated feed endpoints
- Docker production image
- GitHub Actions CI for install, Prisma generation, build, smoke import, and audit

## Breaking And Operational Changes

- Generated feeds are protected by default when `PUBLIC_EXPORTS=false`.
- Feed consumers should use `?token=<export-token>` or `x-export-token`.
- `/manifest.json` remains public.
- Admin mutation routes require `x-admin-token`.
- PostgreSQL is the production datastore.
- Cached feed files are generated under `cache/` and should not be committed.

## Upgrade Notes

1. Pull the v3 release.
2. Copy `.env.example` to `.env`.
3. Configure `DATABASE_URL`, `ADMIN_TOKEN`, `BASE_URL`, and feed source settings.
4. Run Prisma generation and production migrations.
5. Run imports to populate channels, programmes, mappings, and cached feeds.
6. Create export tokens before sharing protected feed URLs.

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run import
npm run build
npm start
```

## Key Endpoints

```text
GET /health
GET /manifest.json
GET /api/docs
GET /api/discovery/manifest
GET /api/discovery/countries
GET /api/discovery/providers
GET /api/discovery/metadata
GET /api/discovery/validation
GET /api/stats/dashboard
GET /country/:country.xml
GET /country/:country.xml.gz
GET /profile/:id.xml
GET /provider/:id.xml
GET /provider/:id.xml.gz
```

## Docker

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec xmltv npx prisma migrate deploy
docker compose logs -f xmltv
```

`docker compose` sets `RUN_MIGRATIONS=true`, so the app container runs
`npx prisma migrate deploy` before startup. `npm run db:push` is for local
development only and is not the production release path.

## Final Checklist

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

## Tagging

Final release tag:

```bash
git tag -a v3.0.0 -m "v3.0.0"
git push origin v3.0.0
```

If the `v3.0.0` tag already exists, verify that it points at the final merged
release commit before moving it.
