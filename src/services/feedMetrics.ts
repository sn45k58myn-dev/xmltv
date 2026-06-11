import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);

async function size(name: string) {
  try {
    const stat = await fs.stat(
      path.join(CACHE_DIR, name)
    );

    return stat.size;
  } catch {
    return 0;
  }
}

export async function getFeedSizes() {
  return {
    ukXml: await size('uk.xml'),
    ukGzip: await size('uk.xml.gz'),
    usXml: await size('us.xml'),
    usGzip: await size('us.xml.gz')
  };
}
