require('dotenv/config');

const { spawn } = require('node:child_process');
const {
  assertBackupFile,
  assertProductionRestoreAllowed,
  verifyBackupManifest
} = require('./backup-utils');

const databaseUrl = process.env.DATABASE_URL;
const backupFile = process.argv[2];

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

if (!backupFile) {
  console.error('Usage: npm run restore:db -- <backup-file>');
  process.exit(1);
}

async function main() {
  assertBackupFile(backupFile);
  assertProductionRestoreAllowed();
  const manifestCheck = await verifyBackupManifest(backupFile);

  if (manifestCheck.skipped) {
    console.warn(`Backup manifest check skipped: ${manifestCheck.reason}`);
  }

  const child = spawn('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    `--dbname=${databaseUrl}`,
    backupFile
  ], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  child.on('error', (error) => {
    console.error(`Unable to start pg_restore: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
