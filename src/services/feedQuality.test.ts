import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { getFeedQuality, getFeedQualityHistory } from './feedQuality';

vi.mock('../db/prisma', () => ({
  prisma: {
    feedDownload: {
      findMany: vi.fn().mockResolvedValue([])
    },
    channel: {
      groupBy: vi.fn().mockResolvedValue([])
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    feedQualitySnapshot: {
      createMany: vi.fn(),
      findMany: vi.fn()
    }
  }
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: vi.fn().mockImplementation((_path, options) => {
      if (options?.withFileTypes) {
        return Promise.resolve([
          {
            name: 'GB.xml',
            isFile: () => true
          }
        ]);
      }

      return Promise.resolve(['GB.xml']);
    }),
    stat: vi.fn().mockResolvedValue({
      size: 2048,
      mtime: new Date()
    }),
    readFile: vi.fn().mockResolvedValue(`
      <tv>
        <channel id="gb.one"><display-name>GB One</display-name></channel>
        <programme start="20260613090000 +0000" stop="20260613100000 +0000" channel="gb.one">
          <title>News</title>
        </programme>
      </tv>
    `)
  }
}));

describe('feedQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists feed quality snapshots when requested', async () => {
    const quality = await getFeedQuality({
      persistSnapshot: true
    });

    expect(quality.feedCount).toBe(1);
    expect(prisma.feedQualitySnapshot.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          feedKey: 'GB.xml',
          score: expect.any(Number),
          grade: expect.any(String),
          valid: true,
          channels: 1,
          programs: 1,
          bytes: 2048
        })
      ]
    });
  });

  it('loads recent feed quality history', async () => {
    vi.mocked(prisma.feedQualitySnapshot.findMany).mockResolvedValue([
      {
        id: 'snapshot-1',
        feedKey: 'GB.xml',
        score: 95,
        grade: 'A',
        valid: true,
        channels: 1,
        programs: 1,
        bytes: 2048,
        reasons: '[]',
        createdAt: new Date()
      }
    ] as any);

    await expect(getFeedQualityHistory(10)).resolves.toHaveLength(1);
    expect(prisma.feedQualitySnapshot.findMany).toHaveBeenCalledWith({
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });
  });
});
