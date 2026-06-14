require('dotenv/config');

const { existsSync, readdirSync, statSync, unlinkSync } = require('node:fs');
const { join } = require('node:path');

const backupDir = process.env.BACKUP_DIR || 'backups';
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);

if (!Number.isFinite(retentionDays) || retentionDays < 1) {
  console.error('BACKUP_RETENTION_DAYS must be a positive number');
  process.exit(1);
}

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
let removed = 0;
let removedManifests = 0;

if (!existsSync(backupDir)) {
  console.log(JSON.stringify({
    backupDir,
    retentionDays,
    removed,
    removedManifests
  }));
  process.exit(0);
}

for (const file of readdirSync(backupDir, {
  withFileTypes: true
})) {
  if (!file.isFile() || !/^xmltv-\d{8}T\d{6}Z\.dump$/.test(file.name)) {
    continue;
  }

  const filePath = join(
    backupDir,
    file.name
  );
  const stat = statSync(filePath);

  if (stat.mtimeMs >= cutoff) {
    continue;
  }

  unlinkSync(filePath);
  removed++;

  const manifestPath = `${filePath}.json`;

  if (existsSync(manifestPath)) {
    unlinkSync(manifestPath);
    removedManifests++;
  }
}

console.log(JSON.stringify({
  backupDir,
  retentionDays,
  removed,
  removedManifests
}));
