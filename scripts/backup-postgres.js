require('dotenv/config');

const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawn } = require('node:child_process');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const backupDir = process.env.BACKUP_DIR || 'backups';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const file = join(backupDir, `xmltv-${stamp}.dump`);

mkdirSync(backupDir, {
  recursive: true
});

const child = spawn('pg_dump', [
  databaseUrl,
  '--format=custom',
  `--file=${file}`
], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('error', (error) => {
  console.error(`Unable to start pg_dump: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log(file);
  }

  process.exit(code ?? 1);
});
