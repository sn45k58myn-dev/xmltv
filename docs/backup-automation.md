# Backup Automation

XMLTV Aggregator uses PostgreSQL as the source of truth. Backups should protect
the PostgreSQL database plus the mounted `cache/`, `uploads/`, and `data/`
directories where applicable.

The included scripts use PostgreSQL custom-format dumps:

```bash
npm run backup:db
npm run backup:verify -- backups/xmltv-YYYYMMDDTHHMMSSZ.dump
npm run restore:db -- backups/xmltv-YYYYMMDDTHHMMSSZ.dump
npm run backup:prune
```

`pg_dump --format=custom` creates archives intended for `pg_restore`, which is
more flexible than plain SQL dumps for restore workflows. Each backup also gets
a `.dump.json` sidecar manifest containing file size, creation time, a redacted
database URL, and a SHA-256 checksum. Keep the manifest beside the dump file so
`restore:db` and `backup:verify` can detect corruption before running
`pg_restore`.

## Environment

```bash
DATABASE_URL=postgresql://xmltv:xmltv@db:5432/xmltv?schema=public
BACKUP_DIR=backups
BACKUP_RETENTION_DAYS=14
VERIFY_DATABASE_URL=postgresql://xmltv:xmltv@db:5432/xmltv_restore_check?schema=public
RESTORE_CONFIRM=I_UNDERSTAND_THIS_REPLACES_PRODUCTION_DATA
```

`VERIFY_DATABASE_URL` must point at a disposable restore-check database. Do not
point it at production. `RESTORE_CONFIRM` is only required when restoring with
`NODE_ENV=production`; set it for that one command after verifying the target
`DATABASE_URL`.

## Cron Example

Run a nightly dump, verify it against a disposable database, then prune old
local dumps:

```cron
17 2 * * * cd /srv/xmltv && npm run backup:db >> /var/log/xmltv-backup.log 2>&1
47 2 * * * cd /srv/xmltv && latest=$(ls -1t backups/xmltv-*.dump | head -1) && npm run backup:verify -- "$latest" >> /var/log/xmltv-backup.log 2>&1
7 3 * * * cd /srv/xmltv && npm run backup:prune >> /var/log/xmltv-backup.log 2>&1
```

Use a non-hour boundary minute so hosted infrastructure is less likely to run
every customer backup at the same instant.

## systemd Timer Example

`/etc/systemd/system/xmltv-backup.service`:

```ini
[Unit]
Description=XMLTV PostgreSQL backup

[Service]
Type=oneshot
WorkingDirectory=/srv/xmltv
EnvironmentFile=/srv/xmltv/.env
ExecStart=/usr/bin/npm run backup:db
ExecStartPost=/usr/bin/npm run backup:prune
```

`/etc/systemd/system/xmltv-backup.timer`:

```ini
[Unit]
Description=Run XMLTV PostgreSQL backup nightly

[Timer]
OnCalendar=*-*-* 02:17:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now xmltv-backup.timer
```

## Docker Compose Example

Run the backup from a one-off app container that has the same environment and
mounted backup volume:

```bash
docker compose run --rm app npm run backup:db
docker compose run --rm app npm run backup:prune
```

Verify the latest backup against a disposable database before trusting the
automation:

```bash
latest=$(ls -1t backups/xmltv-*.dump | head -1)
docker compose run --rm -e VERIFY_DATABASE_URL="$VERIFY_DATABASE_URL" app npm run backup:verify -- "$latest"
```

## Hosted PostgreSQL Notes

- Prefer the provider's managed point-in-time recovery for disaster recovery.
- Keep these `pg_dump` backups as portable exports for release rollback,
  cross-provider migration, and accidental application-level deletes.
- Store at least one copy outside the app host, such as object storage or the
  hosting provider's backup storage.
- Test restore into a disposable database after configuration changes and before
  each release.
- Alert when no fresh backup exists within the expected recovery point window.

## Restore Drill

1. Create a disposable PostgreSQL database.
2. Run `npm run backup:verify -- <backup-file>` with `VERIFY_DATABASE_URL` set.
3. Confirm the sidecar checksum passes and the reported channel/programme counts
   are plausible.
4. Run `npx prisma migrate deploy` against the restored database.
5. Start the app with the restored database and check `/ready` and
   `/api/stats/dashboard`.
