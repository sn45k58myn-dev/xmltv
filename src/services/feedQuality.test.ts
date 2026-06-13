import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { getFeedQuality, getFeedQualityHistory, getFeedQualitySummary } from './feedQuality';

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

  it('summarizes latest persisted quality snapshots for public discovery', async () => {
    vi.mocked(prisma.feedQualitySnapshot.findMany).mockResolvedValue([
      {
        id: 'snapshot-new',
        feedKey: 'GB.xml',
        score: 91,
        grade: 'A',
        valid: true,
        channels: 10,
        programs: 100,
        bytes: 2048,
        reasons: '[]',
        createdAt: new Date('2026-06-13T12:00:00.000Z')
      },
      {
        id: 'snapshot-old',
        feedKey: 'GB.xml',
        score: 70,
        grade: 'C',
        valid: true,
        channels: 8,
        programs: 90,
        bytes: 1024,
        reasons: '["old"]',
        createdAt: new Date('2026-06-12T12:00:00.000Z')
      },
      {
        id: 'snapshot-us',
        feedKey: 'US.xml',
        score: 50,
        grade: 'D',
        valid: false,
        channels: 0,
        programs: 0,
        bytes: 10,
        reasons: '["invalid XMLTV"]',
        createdAt: new Date('2026-06-13T11:00:00.000Z')
      }
    ] as any);

    const summary = await getFeedQualitySummary();

    expect(summary).toMatchObject({
      snapshotOnly: true,
      feedCount: 2,
      averageScore: 70.5,
      validFeeds: 1,
      invalidFeeds: 1
    });
    expect(summary.feeds).toEqual([
      expect.objectContaining({
        feedKey: 'GB.xml',
        score: 91
      }),
      expect.objectContaining({
        feedKey: 'US.xml',
        reasons: ['invalid XMLTV']
      })
    ]);
    expect(prisma.feedQualitySnapshot.findMany).toHaveBeenCalledWith({
      orderBy: {
        createdAt: 'desc'
      },
      take: 1000
    });
  });

  it('bounds invalid and excessive feed quality history limits', async () => {
    await getFeedQualityHistory(Number.NaN);
    await getFeedQualityHistory(50000);

    expect(prisma.feedQualitySnapshot.findMany).toHaveBeenNthCalledWith(1, {
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });
    expect(prisma.feedQualitySnapshot.findMany).toHaveBeenNthCalledWith(2, {
      orderBy: {
        createdAt: 'desc'
      },
      take: 1000
    });
  });
});
