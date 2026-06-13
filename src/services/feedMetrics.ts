import fs from 'node:fs/promises';
import path from 'node:path';

type FeedSize = {
  feed: string;
  bytes: number;
  megabytes: number;
};

const CACHE_DIR = path.join(
  process.cwd(),
  'cache'
);

function isFeedFile(file: string) {
  return file.endsWith('.xml') || file.endsWith('.xml.gz');
}

export async function getFeedSizes(cacheDir = CACHE_DIR): Promise<FeedSize[]> {
  try {
    const entries = await fs.readdir(cacheDir, {
      withFileTypes: true
    });

    const results: FeedSize[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !isFeedFile(entry.name)) {
        continue;
      }

      const stat = await fs.stat(
        path.join(cacheDir, entry.name)
      );

      results.push({
        feed: entry.name,
        bytes: stat.size,
        megabytes: Number(
          (stat.size / 1024 / 1024).toFixed(2)
        )
      });
    }

    return results.sort(
      (a, b) => b.bytes - a.bytes
    );
  } catch {
    return [];
  }
}
