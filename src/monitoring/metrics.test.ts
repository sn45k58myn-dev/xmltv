import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { prometheusMetrics, systemMetrics } from './metrics';
import { requestMetrics } from './requestMetrics';

vi.mock('../db/prisma', () => ({
  prisma: {
    importRun: {
      findFirst: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn()
    },
    channel: {
      count: vi.fn()
    },
    program: {
      count: vi.fn()
    },
    jobQueue: {
      groupBy: vi.fn()
    },
    feedDownload: {
      aggregate: vi.fn(),
      findMany: vi.fn()
    },
    feedQualitySnapshot: {
      findFirst: vi.fn()
    }
  }
}));

vi.mock('../services/feedMetrics', () => ({
  getFeedSizes: vi.fn().mockResolvedValue([
    {
      feed: 'GB.xml',
      bytes: 1024,
      megabytes: 0
    },
    {
      feed: 'GB.xml.gz',
      bytes: 512,
      megabytes: 0
    }
  ])
}));

describe('monitoring metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.importRun.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.importRun.count).mockResolvedValue(2);
    vi.mocked(prisma.channel.count).mockResolvedValue(10);
    vi.mocked(prisma.program.count).mockResolvedValue(20);
    vi.mocked(prisma.importRun.groupBy).mockResolvedValue([
      {
        status: 'success',
        _count: {
          _all: 5
        }
      },
      {
        status: 'failed',
        _count: {
          _all: 2
        }
      }
    ] as any);
    vi.mocked(prisma.jobQueue.groupBy).mockResolvedValue([
      {
        status: 'pending',
        _count: {
          _all: 3
        }
      }
    ] as any);
    vi.mocked(prisma.feedDownload.aggregate).mockResolvedValue({
      _sum: {
        downloads: 99
      }
    } as any);
    vi.mocked(prisma.feedDownload.findMany).mockResolvedValue([
      {
        feedKey: 'GB.xml',
        downloads: 42
      }
    ] as any);
    vi.mocked(prisma.feedQualitySnapshot.findFirst).mockResolvedValue({
      feedKey: 'GB.xml',
      score: 88,
      grade: 'B'
    } as any);
  });

  it('includes production operational metrics in JSON output', async () => {
    const metrics = await systemMetrics();

    expect(metrics.importStatuses).toEqual({
      success: 5,
      failed: 2
    });
    expect(metrics.queueStatuses).toEqual({
      pending: 3
    });
    expect(metrics.totalFeedDownloads).toBe(99);
    expect(metrics.feedCount).toBe(2);
    expect(metrics.totalCacheBytes).toBe(1536);
    expect(metrics.topFeeds[0]).toMatchObject({
      feedKey: 'GB.xml',
      downloads: 42
    });
  });

  it('renders queue, download, and feed quality Prometheus lines', async () => {
    requestMetrics({
      method: 'GET',
      path: '/health'
    } as any, {
      statusCode: 200,
      on: (_event: string, callback: () => void) => callback()
    } as any, vi.fn());

    const text = await prometheusMetrics();

    expect(text).toContain('xmltv_import_runs_total{status="success"} 5');
    expect(text).toContain('xmltv_job_queue_jobs{status="pending"} 3');
    expect(text).toContain('xmltv_feed_downloads_total 99');
    expect(text).toContain('xmltv_feed_downloads_by_feed{feed="GB.xml"} 42');
    expect(text).toContain('xmltv_cached_feeds 2');
    expect(text).toContain('xmltv_cache_bytes 1536');
    expect(text).toContain('xmltv_http_responses_total{status="2xx"}');
    expect(text).toContain('xmltv_latest_feed_quality_score{feed="GB.xml",grade="B"} 88');
  });
});
