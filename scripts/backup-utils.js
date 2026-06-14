const { createHash } = require('node:crypto');
const { createReadStream, existsSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { basename } = require('node:path');

const PRODUCTION_RESTORE_CONFIRMATION = 'I_UNDERSTAND_THIS_REPLACES_PRODUCTION_DATA';

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function redactDatabaseUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (url.password) url.password = 'REDACTED';
    if (url.username) url.username = url.username ? 'REDACTED' : '';

    return url.toString();
  } catch {
    return 'unparseable';
  }
}

async function writeBackupManifest(file, databaseUrl) {
  const stats = statSync(file);
  const manifest = {
    file: basename(file),
    bytes: stats.size,
    sha256: await sha256File(file),
    createdAt: new Date().toISOString(),
    databaseUrl: redactDatabaseUrl(databaseUrl),
    format: 'pg_dump-custom',
    tool: 'xmltv-aggregator'
  };
  const manifestFile = `${file}.json`;

  writeFileSync(
    manifestFile,
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  return {
    manifest,
    manifestFile
  };
}

async function verifyBackupManifest(file) {
  const manifestFile = `${file}.json`;

  if (!existsSync(manifestFile)) {
    return {
      ok: true,
      skipped: true,
      reason: 'manifest not found'
    };
  }

  const manifest = JSON.parse(readFileSync(
    manifestFile,
    'utf8'
  ));
  const actual = await sha256File(file);

  if (manifest.sha256 !== actual) {
    throw new Error(`Backup checksum mismatch for ${file}`);
  }

  return {
    ok: true,
    skipped: false,
    manifest
  };
}

function assertBackupFile(file) {
  if (!file) {
    throw new Error('Backup file path is required');
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`Backup file not found: ${file}`);
  }
}

function assertProductionRestoreAllowed() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (process.env.RESTORE_CONFIRM === PRODUCTION_RESTORE_CONFIRMATION) {
    return;
  }

  throw new Error(
    `Refusing production restore. Set RESTORE_CONFIRM=${PRODUCTION_RESTORE_CONFIRMATION} to continue.`
  );
}

module.exports = {
  PRODUCTION_RESTORE_CONFIRMATION,
  assertBackupFile,
  assertProductionRestoreAllowed,
  redactDatabaseUrl,
  sha256File,
  verifyBackupManifest,
  writeBackupManifest
};
