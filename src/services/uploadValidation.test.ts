import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { safeUploadDisplayName, validateUploadedXml } from './uploadValidation';

let tempDir: string;

async function uploadFile(
  name: string,
  content: string
) {
  const filePath = path.join(
    tempDir,
    name
  );

  await fs.writeFile(
    filePath,
    content,
    'utf8'
  );

  const stat = await fs.stat(filePath);

  return {
    path: filePath,
    size: stat.size
  } as Express.Multer.File;
}

describe('uploadValidation', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(
      os.tmpdir(),
      'xmltv-upload-'
    ));
  });

  afterEach(async () => {
    await fs.rm(
      tempDir,
      {
        recursive: true,
        force: true
      }
    );
  });

  it('sanitizes uploaded filenames for import labels', () => {
    const sanitized = safeUploadDisplayName('../bad\nname<script>.xml');

    expect(sanitized).toBe('badname_script_.xml');
  });

  it('uses a fallback name when the uploaded filename is empty after sanitizing', () => {
    expect(safeUploadDisplayName('\n\t')).toBe('upload.xml');
  });

  it('accepts XMLTV uploads with a tv root', async () => {
    await expect(validateUploadedXml(await uploadFile(
      'guide.xml',
      '<?xml version="1.0"?><tv></tv>'
    ))).resolves.toBeUndefined();
  });

  it('rejects XML uploads that are not XMLTV documents', async () => {
    await expect(validateUploadedXml(await uploadFile(
      'not-xmltv.xml',
      '<rss></rss>'
    ))).rejects.toThrow('XMLTV document');
  });
});
