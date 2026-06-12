# Production Readiness Status

This project has moved beyond the original production-v1 scaffold. The current
platform is a v3 XMLTV aggregator with PostgreSQL persistence, migrations,
Docker, CI, admin UI, import pipeline, cached XML/GZip feeds, export tokens,
source health, job runs, metrics, feed discovery APIs, Schedules Direct support,
audit logging, and production deployment documentation.

## Completed

- ESLint 9 flat config, `typecheck`, `verify`, and CI test execution
- Vitest coverage for parser, validation, XMLTV writer, import pipeline, API
  auth rejection, upload rejection, cache writes, source reliability,
  Schedules Direct adapter, and audit helpers
- Multer 2 upgrade, Helmet, upload validation/cleanup, safe JSON error handler
- Production startup guards for unsafe admin token and local database URLs
- Database-backed scheduler job locks
- Source failure backoff and scheduled import timeout
- Atomic cache writes and cache directory startup probe
- Schedules Direct SD-JSON adapter with token refresh and XMLTV conversion
- AuditLog model, migration, admin audit endpoint, and admin UI Audit tab
- Export token list masking
- Docker production image and Docker Compose stack
- Backup and restore scripts plus restore verification docs
- Backup verification command for disposable restore-check databases
- Hardened Compose defaults: restart policy, readiness healthcheck, dropped
  capabilities, no-new-privileges, and `/tmp` tmpfs
- Optional Redis-backed API rate limiting for multi-replica deployments

## Current Production Baseline

Required release checks:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run verify
npm run smoke:import
docker compose build
docker compose config
```

Runtime checks:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/manifest.json
curl -H "x-admin-token: $ADMIN_TOKEN" http://localhost:3000/api/stats/dashboard
```

Deployment requirements:

- Use `NODE_ENV=production`.
- Use a non-default `ADMIN_TOKEN`.
- Use PostgreSQL with `npx prisma migrate deploy`.
- Persist PostgreSQL data, `cache/`, `data/`, `uploads/`, and backup output.
- Run only one `ENABLE_SCHEDULER=true` scheduler owner in multi-container
  deployments.
- Put the app behind HTTPS and a trusted reverse proxy before exposing admin UI.

## Remaining Production Enhancements

- Optional Redis-backed cache metadata for larger installations
- Dedicated worker process or queue for long-running imports
- More complete feed quality scoring and historical quality trends
- Backup automation examples for hosted PostgreSQL providers
- Load testing guidance and large-feed performance benchmarks

## Deferred By Design

- Architecture rewrite: not needed for current release.
- Replacing PostgreSQL: not planned.
- Making generated feeds public by default: not planned.
