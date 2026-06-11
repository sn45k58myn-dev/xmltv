import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);

export async function getCachedFeed(
  name: string
): Promise<string | null> {
  try {
    return await fs.readFile(
      path.join(
        CACHE_DIR,
        `${name}.xml`
      ),
      'utf8'
    );
  } catch {
    return null;
  }
}

export async function setCachedFeed(
  name: string,
  xml: string
) {
  await fs.mkdir(CACHE_DIR, {
    recursive: true
  });

  await fs.writeFile(
    path.join(
      CACHE_DIR,
      `${name}.xml`
    ),
    xml,
    'utf8'
  );
}

export async function setCachedFeedGzip(
  name: string,
  data: Buffer
) {
  await fs.mkdir(CACHE_DIR, {
    recursive: true
  });

  await fs.writeFile(
    path.join(
      CACHE_DIR,
      `${name}.xml.gz`
    ),
    data
  );
}

export async function getCachedFeedGzip(
  name: string
): Promise<Buffer | null> {
  try {
    return await fs.readFile(
      path.join(
        CACHE_DIR,
        `${name}.xml.gz`
      )
    );
  } catch {
    return null;
  }
}