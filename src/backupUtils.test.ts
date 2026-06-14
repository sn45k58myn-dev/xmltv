import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  PRODUCTION_RESTORE_CONFIRMATION,
  assertProductionRestoreAllowed,
  redactDatabaseUrl,
  sha256File,
  verifyBackupManifest,
  writeBackupManifest
} = require('../scripts/backup-utils');

let tempDir: string | undefined;

function tempFile(
  name: string,
  content: string
) {
  tempDir = tempDir || mkdtempSync(join(
    tmpdir(),
    'xmltv-backup-utils-'
  ));
  const file = join(
    tempDir,
    name
  );

  writeFileSync(
    file,
    content
  );

  return file;
}

describe('backup utils', () => {
  afterEach(() => {
    if (tempDir) {
      rmSync(
        tempDir,
        {
          recursive: true,
          force: true
        }
      );
      tempDir = undefined;
    }

    delete process.env.NODE_ENV;
    delete process.env.RESTORE_CONFIRM;
  });

  it('writes and verifies checksum manifests', async () => {
    const file = tempFile(
      'xmltv.dump',
      'backup-content'
    );
    const { manifestFile } = await writeBackupManifest(
      file,
      'postgresql://user:secret@example.com/xmltv'
    );
    const manifest = JSON.parse(readFileSync(
      manifestFile,
      'utf8'
    ));

    expect(manifest).toMatchObject({
      file: 'xmltv.dump',
      bytes: 14,
      format: 'pg_dump-custom',
      tool: 'xmltv-aggregator'
    });
    expect(manifest.databaseUrl).not.toContain('secret');
    await expect(verifyBackupManifest(file)).resolves.toMatchObject({
      ok: true,
      skipped: false
    });
  });

  it('detects backup checksum mismatches', async () => {
    const file = tempFile(
      'xmltv.dump',
      'backup-content'
    );

    await writeBackupManifest(
      file,
      'postgresql://user:secret@example.com/xmltv'
    );
    writeFileSync(
      file,
      'changed-content'
    );

    await expect(verifyBackupManifest(file)).rejects.toThrow('Backup checksum mismatch');
  });

  it('redacts database credentials in manifests', () => {
    expect(redactDatabaseUrl('postgresql://user:secret@example.com/xmltv')).toContain('REDACTED');
    expect(redactDatabaseUrl('postgresql://user:secret@example.com/xmltv')).not.toContain('secret');
  });

  it('requires explicit confirmation before production restores', () => {
    process.env.NODE_ENV = 'production';

    expect(() => assertProductionRestoreAllowed()).toThrow('Refusing production restore');

    process.env.RESTORE_CONFIRM = PRODUCTION_RESTORE_CONFIRMATION;

    expect(() => assertProductionRestoreAllowed()).not.toThrow();
  });

  it('hashes files with sha256', async () => {
    const file = tempFile(
      'hash-me.txt',
      'abc'
    );

    await expect(sha256File(file)).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
