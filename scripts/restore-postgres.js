require('dotenv/config');

const { existsSync, statSync } = require('node:fs');
const { spawn } = require('node:child_process');

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

if (!existsSync(backupFile) || !statSync(backupFile).isFile()) {
  console.error(`Backup file not found: ${backupFile}`);
  process.exit(1);
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
