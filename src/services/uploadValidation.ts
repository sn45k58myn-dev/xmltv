import fs from 'node:fs/promises';
import path from 'node:path';

const XML_PREAMBLE_BYTES = 4096;
const MAX_UPLOAD_NAME_LENGTH = 120;
const XMLTV_ROOT_PATTERN = /<\s*tv(?:\s|>)/i;

export function safeUploadDisplayName(originalName: string) {
  const baseName = path.basename(originalName || 'upload.xml');
  const sanitized = baseName
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);

      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/[^\w .()+-]/g, '_')
    .trim();

  return (sanitized || 'upload.xml').slice(0, MAX_UPLOAD_NAME_LENGTH);
}

export async function validateUploadedXml(file: Express.Multer.File) {
  if (file.size <= 0) {
    throw new Error('Uploaded XMLTV file is empty.');
  }

  const handle = await fs.open(file.path, 'r');

  try {
    const buffer = Buffer.alloc(Math.min(XML_PREAMBLE_BYTES, file.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const preamble = buffer.subarray(0, bytesRead).toString('utf8').trimStart();

    if (!preamble.startsWith('<')) {
      throw new Error('Uploaded XMLTV file does not look like XML.');
    }

    if (!XMLTV_ROOT_PATTERN.test(preamble)) {
      throw new Error('Uploaded XMLTV file does not look like an XMLTV document.');
    }
  } finally {
    await handle.close();
  }
}

export async function cleanupUploadedFile(file?: Express.Multer.File) {
  if (!file?.path) {
    return;
  }

  await fs.unlink(file.path).catch(() => undefined);
}
