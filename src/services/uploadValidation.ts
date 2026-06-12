import fs from 'node:fs/promises';

const XML_PREAMBLE_BYTES = 512;

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
