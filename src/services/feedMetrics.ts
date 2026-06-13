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

export async function getFeedSizes(): Promise<FeedSize[]> {
  try {
    const files = await fs.readdir(CACHE_DIR);

    const results: FeedSize[] = [];

    for (const file of files) {
      const stat = await fs.stat(
        path.join(CACHE_DIR, file)
      );

      results.push({
        feed: file,
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
