require('dotenv/config');

const { spawn } = require('node:child_process');

const backupFile = process.argv[2];
const verifyDatabaseUrl = process.env.VERIFY_DATABASE_URL;

if (!backupFile) {
  console.error('Usage: VERIFY_DATABASE_URL=<restore-db-url> npm run backup:verify -- <backup-file>');
  process.exit(1);
}

if (!verifyDatabaseUrl) {
  console.error('VERIFY_DATABASE_URL is required and must point at a disposable restore-check database');
  process.exit(1);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with ${code ?? 1}`));
    });
  });
}

async function main() {
  await run('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    `--dbname=${verifyDatabaseUrl}`,
    backupFile
  ]);

  await run('npx', [
    'prisma',
    'migrate',
    'deploy'
  ], {
    env: {
      ...process.env,
      DATABASE_URL: verifyDatabaseUrl
    }
  });

  await run('node', [
    '-e',
    'const {PrismaClient}=require("@prisma/client"); const p=new PrismaClient(); Promise.all([p.channel.count(), p.program.count()]).then(([channels, programs])=>{ console.log(JSON.stringify({ok:true, channels, programs})); return p.$disconnect(); })'
  ], {
    env: {
      ...process.env,
      DATABASE_URL: verifyDatabaseUrl
    }
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
