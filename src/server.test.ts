import request from 'supertest';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db/prisma';
import { assertCacheDirectoryWritable, createCachedFeedReadStream, getCachedFeedFile } from './services/cacheService';
import { recordFeedDownload } from './services/downloadMetrics';

vi.mock('./db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
    source: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    sourceHealth: {
      findMany: vi.fn()
    },
    channel: {
      findMany: vi.fn(),
      count: vi.fn()
    },
    program: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn()
    },
    alias: {
      count: vi.fn()
    },
    exportProfile: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    importRun: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn()
    },
    jobRun: {
      findMany: vi.fn(),
      findUnique: vi.fn()
    },
    jobQueue: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn()
    },
    exportToken: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn()
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn()
    },
    apiKey: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn()
    }
  }
}));

vi.mock('./services/cacheService', () => ({
  assertCacheDirectoryWritable: vi.fn(),
  createCachedFeedReadStream: vi.fn(() => Readable.from(['<tv></tv>'])),
  getCachedFeedFile: vi.fn()
}));

vi.mock('./services/downloadMetrics', () => ({
  recordFeedDownload: vi.fn()
}));

async function loadApp() {
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.PUBLIC_EXPORTS = 'false';
  process.env.ENABLE_SCHEDULER = 'false';
  process.env.RATE_LIMIT_MAX = '1000';

  const serverModule = await import('./server');

  return serverModule.app;
}

function mockExportToken(
  overrides: Partial<{
    id: string;
    token: string;
    active: boolean;
    profileId: string | null;
    providerId: string | null;
  }> = {}
) {
  vi.mocked(prisma.exportToken.findUnique).mockResolvedValue({
    id: overrides.id ?? 'export-token-1',
    name: 'Feed token',
    token: overrides.token ?? 'valid-token',
    profileId: overrides.profileId ?? null,
    providerId: overrides.providerId ?? null,
    active: overrides.active ?? true,
    requests: 0,
    lastUsedAt: null,
    createdAt: new Date('2026-06-14T00:00:00.000Z')
  } as any);
  vi.mocked(prisma.exportToken.updateMany).mockResolvedValue({
    count: 1
  });
}

describe('server API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns health status', async () => {
    const app = await loadApp();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('does not expose the Express powered-by header', async () => {
    const app = await loadApp();
    const response = await request(app).get('/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the root page without inline styles', async () => {
    const app = await loadApp();
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).not.toContain('<style>');
  });

  it('returns ready when the database probe succeeds', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }]);
    vi.mocked(assertCacheDirectoryWritable).mockResolvedValue(undefined);

    const app = await loadApp();
    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      database: true,
      cache: true
    });
  });

  it('returns not ready when cache storage is not writable', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }]);
    vi.mocked(assertCacheDirectoryWritable).mockRejectedValue(new Error('read-only cache'));

    const app = await loadApp();
    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      database: true,
      cache: false
    });
  });

  it('rejects admin routes without an admin token', async () => {
    const app = await loadApp();
    const response = await request(app).get('/api/admin/summary');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Admin credentials required');
  });

  it('marks admin API responses as non-cacheable', async () => {
    vi.mocked(prisma.source.count).mockResolvedValue(1);
    vi.mocked(prisma.channel.count).mockResolvedValue(2);
    vi.mocked(prisma.program.count).mockResolvedValue(3);
    vi.mocked(prisma.alias.count).mockResolvedValue(4);
    vi.mocked(prisma.exportProfile.count).mockResolvedValue(5);
    vi.mocked(prisma.importRun.count).mockResolvedValue(6);
    vi.mocked(prisma.exportToken.count).mockResolvedValue(7);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/admin/summary')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('bounds admin imports list limits', async () => {
    vi.mocked(prisma.importRun.findMany).mockResolvedValue([]);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/admin/imports?limit=50000')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(prisma.importRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 500
    }));
  });

  it('limits coverage programme aggregation to the returned channel page', async () => {
    vi.mocked(prisma.channel.findMany).mockResolvedValue([
      {
        id: 'channel-1',
        displayName: 'BBC One',
        country: 'GB',
        category: 'News'
      }
    ] as any);
    vi.mocked(prisma.program.groupBy).mockResolvedValue([
      {
        channelId: 'channel-1',
        _count: {
          _all: 10
        },
        _min: {
          start: new Date('2026-06-14T10:00:00.000Z')
        },
        _max: {
          stop: new Date('2026-06-14T11:00:00.000Z')
        }
      }
    ] as any);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/admin/coverage?limit=50000')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(prisma.channel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 5000
    }));
    expect(prisma.program.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        channelId: {
          in: ['channel-1']
        }
      }
    }));
    expect(response.body[0]).toMatchObject({
      id: 'channel-1',
      programs: 10
    });
  });

  it('protects detailed stats routes', async () => {
    const app = await loadApp();
    const response = await request(app).get('/api/stats/imports');

    expect(response.status).toBe(401);
  });

  it('bounds authenticated stats import limits', async () => {
    vi.mocked(prisma.importRun.findMany).mockResolvedValue([]);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/stats/imports?limit=50000')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(prisma.importRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 500
    }));
  });

  it('protects source health details', async () => {
    const app = await loadApp();
    const response = await request(app).get('/api/source-health');

    expect(response.status).toBe(401);
  });

  it('bounds authenticated source health limits', async () => {
    vi.mocked(prisma.sourceHealth.findMany).mockResolvedValue([]);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/source-health?limit=50000&sourceId=source-1&status=failed')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(prisma.sourceHealth.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sourceId: 'source-1',
        status: 'failed'
      },
      take: 1000
    }));
  });

  it('returns source health summary with failure streaks and backoff state', async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      {
        id: 'source-1',
        name: 'Flaky',
        enabled: true,
        priority: 1
      }
    ] as any);
    vi.mocked(prisma.sourceHealth.findMany).mockResolvedValue([
      {
        sourceId: 'source-1',
        status: 'failed',
        message: 'Source Flaky returned HTTP 500 from https://example.com/feed.xml.',
        checkedAt: new Date()
      },
      {
        sourceId: 'source-1',
        status: 'failed',
        message: 'Previous failure',
        checkedAt: new Date(Date.now() - 60_000)
      },
      {
        sourceId: 'source-1',
        status: 'success',
        message: 'Previous success',
        checkedAt: new Date(Date.now() - 120_000)
      }
    ] as any);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/source-health/summary')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.body.sources[0]).toMatchObject({
      sourceId: 'source-1',
      name: 'Flaky',
      status: 'failed',
      failureStreak: 2,
      inBackoff: true
    });
  });

  it('rejects invalid source health filters', async () => {
    const app = await loadApp();
    const badStatus = await request(app)
      .get('/api/source-health?status=unknown')
      .set('x-admin-token', 'test-admin-token');
    const badSourceId = await request(app)
      .get('/api/source-health?sourceId=../source')
      .set('x-admin-token', 'test-admin-token');

    expect(badStatus.status).toBe(400);
    expect(badStatus.body.error).toContain('Invalid source health status');
    expect(badSourceId.status).toBe(400);
    expect(badSourceId.body.error).toContain('Invalid route id');
    expect(prisma.sourceHealth.findMany).not.toHaveBeenCalled();
  });

  it('rejects query-string admin tokens by default', async () => {
    const app = await loadApp();
    const response = await request(app).get('/api/admin/summary?adminToken=test-admin-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Admin credentials required');
  });

  it('accepts admin API keys on admin routes', async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      id: 'api-key-1',
      name: 'CI',
      prefix: 'ak_123456789',
      hash: 'hash',
      role: 'admin',
      active: true,
      requests: 0,
      lastUsedAt: null,
      createdAt: new Date('2026-06-13T10:00:00.000Z'),
      updatedAt: new Date('2026-06-13T10:00:00.000Z')
    } as any);
    vi.mocked(prisma.apiKey.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.source.count).mockResolvedValue(1);
    vi.mocked(prisma.channel.count).mockResolvedValue(2);
    vi.mocked(prisma.program.count).mockResolvedValue(3);
    vi.mocked(prisma.alias.count).mockResolvedValue(4);
    vi.mocked(prisma.exportProfile.count).mockResolvedValue(5);
    vi.mocked(prisma.importRun.count).mockResolvedValue(6);
    vi.mocked(prisma.exportToken.count).mockResolvedValue(7);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/admin/summary')
      .set('x-api-key', 'ak_test_admin_key');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sources: 1,
      channels: 2,
      programs: 3
    });
    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        hash: expect.any(String),
        active: true
      }
    }));
  });

  it('accepts viewer API keys on read-only admin routes', async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      id: 'api-key-2',
      name: 'Viewer',
      prefix: 'ak_987654321',
      hash: 'hash',
      role: 'viewer',
      active: true,
      requests: 0,
      lastUsedAt: null,
      createdAt: new Date('2026-06-13T10:00:00.000Z'),
      updatedAt: new Date('2026-06-13T10:00:00.000Z')
    } as any);
    vi.mocked(prisma.apiKey.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.source.count).mockResolvedValue(1);
    vi.mocked(prisma.channel.count).mockResolvedValue(2);
    vi.mocked(prisma.program.count).mockResolvedValue(3);
    vi.mocked(prisma.alias.count).mockResolvedValue(4);
    vi.mocked(prisma.exportProfile.count).mockResolvedValue(5);
    vi.mocked(prisma.importRun.count).mockResolvedValue(6);
    vi.mocked(prisma.exportToken.count).mockResolvedValue(7);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/admin/summary')
      .set('x-api-key', 'ak_test_viewer_key');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sources: 1,
      channels: 2,
      programs: 3
    });
  });

  it('bounds admin lifecycle list endpoints', async () => {
    vi.mocked(prisma.source.findMany).mockResolvedValue([]);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);
    vi.mocked(prisma.exportProfile.findMany).mockResolvedValue([]);
    vi.mocked(prisma.exportToken.findMany).mockResolvedValue([]);

    const app = await loadApp();

    await request(app)
      .get('/api/admin/sources?limit=999999')
      .set('x-admin-token', 'test-admin-token');
    await request(app)
      .get('/api/admin/api-keys?limit=999999')
      .set('x-admin-token', 'test-admin-token');
    await request(app)
      .get('/api/admin/profiles?limit=999999')
      .set('x-admin-token', 'test-admin-token');
    await request(app)
      .get('/api/admin/tokens?limit=999999')
      .set('x-admin-token', 'test-admin-token');

    expect(prisma.source.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 5000
    }));
    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 500
    }));
    expect(prisma.exportProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 1000
    }));
    expect(prisma.exportToken.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 500
    }));
  });

  it('returns admin queue health summary', async () => {
    vi.mocked(prisma.jobQueue.groupBy).mockResolvedValue([
      {
        status: 'pending',
        _count: {
          _all: 2
        }
      }
    ] as any);
    vi.mocked(prisma.jobQueue.findFirst).mockResolvedValue({
      createdAt: new Date()
    } as any);
    vi.mocked(prisma.jobQueue.count)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/admin/queue/summary')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      pendingJobs: 2,
      staleRunningJobs: 1,
      failedJobs: 3,
      runningJobs: 4
    });
  });

  it('allows admins to retry failed queue jobs', async () => {
    vi.mocked(prisma.jobQueue.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .post('/api/admin/queue/job-1/retry')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      retried: true,
      id: 'job-1'
    });
    expect(prisma.jobQueue.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'job-1',
        status: 'failed'
      }
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'queue.retry_failed',
        entityId: 'job-1'
      })
    }));
  });

  it('allows admins to requeue stale running jobs', async () => {
    vi.mocked(prisma.jobQueue.updateMany).mockResolvedValue({ count: 2 });
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .post('/api/admin/queue/stale/requeue')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      requeued: 2
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'queue.requeue_stale'
      })
    }));
  });

  it('rejects invalid admin route ids before database mutations', async () => {
    const app = await loadApp();
    const apiKeyResponse = await request(app)
      .patch('/api/admin/api-keys/..%2Fkey')
      .set('x-admin-token', 'test-admin-token')
      .send({
        name: 'Updated'
      });
    const exportTokenResponse = await request(app)
      .patch('/api/export-tokens/..%2Ftoken')
      .set('x-admin-token', 'test-admin-token')
      .send({
        name: 'Updated'
      });

    expect(apiKeyResponse.status).toBe(400);
    expect(apiKeyResponse.body.error).toContain('Invalid route id');
    expect(exportTokenResponse.status).toBe(400);
    expect(exportTokenResponse.body.error).toContain('Invalid route id');
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
    expect(prisma.exportToken.update).not.toHaveBeenCalled();
  });

  it('rejects viewer API keys on admin-only routes', async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      id: 'api-key-3',
      name: 'Viewer',
      prefix: 'ak_111222333',
      hash: 'hash',
      role: 'viewer',
      active: true,
      requests: 0,
      lastUsedAt: null,
      createdAt: new Date('2026-06-13T10:00:00.000Z'),
      updatedAt: new Date('2026-06-13T10:00:00.000Z')
    } as any);
    vi.mocked(prisma.apiKey.updateMany).mockResolvedValue({ count: 1 });

    const app = await loadApp();
    const response = await request(app)
      .get('/api/admin/api-keys')
      .set('x-api-key', 'ak_test_viewer_key');

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('role is not allowed');
  });

  it('rejects protected feeds when no export token is supplied', async () => {
    const app = await loadApp();
    const response = await request(app).get('/country/GB.xml');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Export token required');
  });

  it('rejects invalid country feed route params', async () => {
    mockExportToken();

    const app = await loadApp();
    const response = await request(app)
      .get('/country/GB1.xml')
      .set('x-export-token', 'valid-token');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid country code');
  });

  it('rejects protected feeds when the export token is invalid', async () => {
    vi.mocked(prisma.exportToken.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.exportToken.updateMany).mockResolvedValue({
      count: 0
    });

    const app = await loadApp();
    const response = await request(app)
      .get('/country/GB.xml')
      .set('x-export-token', 'bad-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Invalid or inactive export token');
  });

  it('prefers header export tokens over query-string tokens', async () => {
    mockExportToken({
      id: 'header-token-id',
      token: 'header-token'
    });
    vi.mocked(getCachedFeedFile).mockResolvedValue({
      filePath: 'cache/GB.xml',
      size: Buffer.byteLength('<tv></tv>'),
      mtime: new Date('2026-06-14T00:00:00.000Z')
    });
    vi.mocked(recordFeedDownload).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .get('/country/GB.xml?token=query-token')
      .set('x-export-token', 'header-token');

    expect(response.status).toBe(200);
    expect(prisma.exportToken.findUnique).toHaveBeenCalledWith({
      where: {
        token: 'header-token'
      }
    });
    expect(prisma.exportToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'header-token-id',
        active: true
      }
    }));
  });

  it('marks protected feed responses as private cache entries', async () => {
    mockExportToken();
    vi.mocked(getCachedFeedFile).mockResolvedValue({
      filePath: 'cache/GB.xml',
      size: Buffer.byteLength('<tv></tv>'),
      mtime: new Date('2026-06-14T00:00:00.000Z')
    });
    vi.mocked(recordFeedDownload).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .get('/country/GB.xml')
      .set('x-export-token', 'valid-token');

    expect(response.status).toBe(200);
    expect(response.text).toBe('<tv></tv>');
    expect(response.headers['cache-control']).toBe('private, max-age=300');
    expect(response.headers.etag).toMatch(/^W\/".+"$/);
    expect(response.headers['last-modified']).toBe('Sun, 14 Jun 2026 00:00:00 GMT');
    expect(response.headers['content-length']).toBe(String(Buffer.byteLength('<tv></tv>')));
    expect(response.headers.vary).toContain('x-export-token');
    expect(recordFeedDownload).toHaveBeenCalledWith('GB.xml');
  });

  it('allows provider-scoped export tokens only on the matching provider feed', async () => {
    mockExportToken({
      providerId: 'jellyextreme'
    });
    vi.mocked(getCachedFeedFile).mockResolvedValue({
      filePath: 'cache/provider_jellyextreme.xml',
      size: Buffer.byteLength('<tv></tv>'),
      mtime: new Date('2026-06-14T00:00:00.000Z')
    });
    vi.mocked(recordFeedDownload).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .get('/provider/jellyextreme.xml')
      .set('x-export-token', 'valid-token');

    expect(response.status).toBe(200);
    expect(prisma.exportToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'export-token-1',
        active: true
      }
    }));
    expect(recordFeedDownload).toHaveBeenCalledWith('provider_jellyextreme.xml');
  });

  it('rejects scoped export tokens on non-matching feeds without incrementing usage', async () => {
    mockExportToken({
      providerId: 'jellyextreme'
    });

    const app = await loadApp();
    const countryResponse = await request(app)
      .get('/country/GB.xml')
      .set('x-export-token', 'valid-token');
    const providerResponse = await request(app)
      .get('/provider/other-provider.xml')
      .set('x-export-token', 'valid-token');

    expect(countryResponse.status).toBe(403);
    expect(countryResponse.body.error).toContain('not allowed');
    expect(providerResponse.status).toBe(403);
    expect(providerResponse.body.error).toContain('not allowed');
    expect(prisma.exportToken.updateMany).not.toHaveBeenCalled();
    expect(getCachedFeedFile).not.toHaveBeenCalled();
  });

  it('enforces profile-specific export rate limits for profile-scoped tokens', async () => {
    mockExportToken({
      id: 'limited-token',
      profileId: 'profile-1'
    });
    vi.mocked(prisma.exportProfile.findUnique).mockResolvedValue({
      rateLimit: 1
    } as any);
    vi.mocked(prisma.exportProfile.findUniqueOrThrow).mockResolvedValue({
      id: 'profile-1',
      name: 'Limited customer',
      slug: 'limited',
      country: null,
      category: null,
      providerId: null,
      channelIds: null,
      token: null,
      rateLimit: 1,
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:00:00.000Z')
    } as any);
    vi.mocked(prisma.channel.findMany).mockResolvedValue([]);
    vi.mocked(recordFeedDownload).mockResolvedValue({} as any);

    const app = await loadApp();
    const first = await request(app)
      .get('/profile/profile-1.xml')
      .set('x-export-token', 'valid-token');
    const second = await request(app)
      .get('/profile/profile-1.xml')
      .set('x-export-token', 'valid-token');

    expect(first.status).toBe(200);
    expect(first.headers['x-profile-rate-limit-limit']).toBe('1');
    expect(first.headers['x-profile-rate-limit-remaining']).toBe('0');
    expect(second.status).toBe(429);
    expect(second.body.error).toContain('Profile export rate limit exceeded');
    expect(prisma.exportToken.updateMany).toHaveBeenCalledTimes(1);
    expect(recordFeedDownload).toHaveBeenCalledTimes(1);
  });

  it('returns 304 for unchanged cached feeds without streaming or counting a download', async () => {
    const mtime = new Date('2026-06-14T00:00:00.000Z');
    const size = Buffer.byteLength('<tv></tv>');

    mockExportToken();
    vi.mocked(getCachedFeedFile).mockResolvedValue({
      filePath: 'cache/GB.xml',
      size,
      mtime
    });
    vi.mocked(recordFeedDownload).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .get('/country/GB.xml')
      .set('x-export-token', 'valid-token')
      .set('if-none-match', `W/"${size.toString(16)}-${mtime.getTime().toString(16)}"`);

    expect(response.status).toBe(304);
    expect(response.text).toBe('');
    expect(response.headers.etag).toBe(`W/"${size.toString(16)}-${mtime.getTime().toString(16)}"`);
    expect(response.headers['last-modified']).toBe('Sun, 14 Jun 2026 00:00:00 GMT');
    expect(createCachedFeedReadStream).not.toHaveBeenCalled();
    expect(recordFeedDownload).not.toHaveBeenCalled();
  });

  it('returns 304 for if-modified-since cached feed requests at HTTP date precision', async () => {
    const mtime = new Date('2026-06-14T00:00:00.500Z');
    const size = Buffer.byteLength('<tv></tv>');

    mockExportToken();
    vi.mocked(getCachedFeedFile).mockResolvedValue({
      filePath: 'cache/GB.xml',
      size,
      mtime
    });
    vi.mocked(recordFeedDownload).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .get('/country/GB.xml')
      .set('x-export-token', 'valid-token')
      .set('if-modified-since', 'Sun, 14 Jun 2026 00:00:00 GMT');

    expect(response.status).toBe(304);
    expect(createCachedFeedReadStream).not.toHaveBeenCalled();
    expect(recordFeedDownload).not.toHaveBeenCalled();
  });

  it('serves cached feed HEAD requests without streaming or counting a download', async () => {
    const mtime = new Date('2026-06-14T00:00:00.000Z');
    const size = Buffer.byteLength('<tv></tv>');

    mockExportToken();
    vi.mocked(getCachedFeedFile).mockResolvedValue({
      filePath: 'cache/GB.xml',
      size,
      mtime
    });
    vi.mocked(recordFeedDownload).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .head('/country/GB.xml')
      .set('x-export-token', 'valid-token');

    expect(response.status).toBe(200);
    expect(response.text).toBeUndefined();
    expect(response.headers['content-length']).toBe(String(size));
    expect(response.headers.etag).toBe(`W/"${size.toString(16)}-${mtime.getTime().toString(16)}"`);
    expect(createCachedFeedReadStream).not.toHaveBeenCalled();
    expect(recordFeedDownload).not.toHaveBeenCalled();
  });

  it('rejects obviously non-XML uploads before import processing', async () => {
    const app = await loadApp();
    const response = await request(app)
      .post('/imports/upload')
      .set('x-admin-token', 'test-admin-token')
      .attach('xmltv', Buffer.from('not xml at all'), 'bad.txt');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('does not look like XML');
  });

  it('rejects uploads with more than one XMLTV file', async () => {
    const xml = Buffer.from('<tv></tv>');
    const app = await loadApp();
    const response = await request(app)
      .post('/imports/upload')
      .set('x-admin-token', 'test-admin-token')
      .attach('xmltv', xml, 'one.xml')
      .attach('xmltv', xml, 'two.xml');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('one XMLTV file');
  });

  it('returns a generic JSON error for internal route failures', async () => {
    vi.mocked(prisma.source.findMany).mockRejectedValue(new Error('database secret details'));

    const app = await loadApp();
    const response = await request(app)
      .get('/sources')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      requestId: expect.any(String),
      error: 'Internal server error'
    });
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
    expect(response.text).not.toContain('database secret details');
  });

  it('rejects unexpected admin source payload fields', async () => {
    const app = await loadApp();
    const response = await request(app)
      .post('/api/admin/sources')
      .set('x-admin-token', 'test-admin-token')
      .send({
        name: 'Source',
        type: 'url',
        id: 'not-allowed'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request payload.');
    expect(prisma.source.create).not.toHaveBeenCalled();
  });

  it('disables sources instead of hard deleting them', async () => {
    vi.mocked(prisma.source.update).mockResolvedValue({
      id: 'source-1',
      name: 'Provider',
      type: 'url',
      enabled: false,
      url: 'https://example.com/feed.xml',
      priority: 1,
      mergeWeight: 1,
      createdAt: new Date('2026-06-12T12:00:00.000Z'),
      updatedAt: new Date('2026-06-13T12:00:00.000Z')
    } as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .delete('/api/sources/source-1')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      disabled: true,
      source: {
        id: 'source-1',
        enabled: false
      }
    });
    expect(prisma.source.update).toHaveBeenCalledWith({
      where: {
        id: 'source-1'
      },
      data: {
        enabled: false
      }
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'source.disable',
        entityType: 'Source',
        entityId: 'source-1'
      })
    }));
  });

  it('rejects unexpected export token payload fields', async () => {
    const app = await loadApp();
    const response = await request(app)
      .post('/api/admin/tokens')
      .set('x-admin-token', 'test-admin-token')
      .send({
        name: 'Token',
        token: 'caller-supplied-token'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request payload.');
    expect(prisma.exportToken.create).not.toHaveBeenCalled();
  });

  it('rejects ambiguous or unsafe export token scopes', async () => {
    const app = await loadApp();
    const ambiguous = await request(app)
      .post('/api/admin/tokens')
      .set('x-admin-token', 'test-admin-token')
      .send({
        profileId: 'profile-1',
        providerId: 'provider-1'
      });
    const unsafe = await request(app)
      .post('/api/export-tokens')
      .set('x-admin-token', 'test-admin-token')
      .send({
        token: '1234567890123456',
        providerId: '../provider'
      });

    expect(ambiguous.status).toBe(400);
    expect(ambiguous.body.error).toBe('Invalid request payload.');
    expect(ambiguous.body.issues[0].message).toContain('Choose either profileId or providerId');
    expect(unsafe.status).toBe(400);
    expect(unsafe.body.error).toBe('Invalid request payload.');
    expect(unsafe.body.issues[0].message).toContain('Must be a safe route id');
    expect(prisma.exportToken.create).not.toHaveBeenCalled();
  });

  it('rejects invalid channel merge payloads', async () => {
    const app = await loadApp();
    const response = await request(app)
      .post('/api/admin/channels/merge')
      .set('x-admin-token', 'test-admin-token')
      .send({
        targetChannelId: 'channel-1',
        channelIdsToMerge: 'channel-2'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request payload.');
  });

  it('returns admin audit events for valid admin tokens', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: 'audit-1',
        action: 'source.create',
        entityType: 'Source',
        entityId: 'source-1',
        actor: 'request-1',
        metadata: '{"name":"Test"}',
        createdAt: new Date('2026-06-12T12:00:00.000Z')
      }
    ] as any);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/admin/audit')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: 'audit-1',
      action: 'source.create'
    });
  });

  it('does not expose full export tokens in admin token listing', async () => {
    vi.mocked(prisma.exportToken.findMany).mockResolvedValue([
      {
        id: 'token-1',
        name: 'Main',
        token: 'abcdef1234567890',
        profileId: null,
        providerId: null,
        active: true,
        requests: 0,
        lastUsedAt: null,
        createdAt: new Date('2026-06-12T12:00:00.000Z')
      }
    ] as any);

    const app = await loadApp();
    const response = await request(app)
      .get('/api/export-tokens')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(200);
    expect(response.body[0].token).toBeUndefined();
    expect(response.body[0].tokenPreview).toBe('abcdef...7890');
  });

  it('updates export token metadata without exposing the token secret', async () => {
    vi.mocked(prisma.exportToken.update).mockResolvedValue({
      id: 'token-1',
      name: 'Jellyfin token',
      token: 'abcdef1234567890',
      profileId: 'profile-1',
      providerId: null,
      active: false,
      requests: 12,
      lastUsedAt: null,
      createdAt: new Date('2026-06-12T12:00:00.000Z')
    } as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .patch('/api/export-tokens/token-1')
      .set('x-admin-token', 'test-admin-token')
      .send({
        name: 'Jellyfin token',
        profileId: 'profile-1',
        active: false
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeUndefined();
    expect(response.body.tokenPreview).toBe('abcdef...7890');
    expect(prisma.exportToken.update).toHaveBeenCalledWith({
      where: {
        id: 'token-1'
      },
      data: {
        name: 'Jellyfin token',
        profileId: 'profile-1',
        active: false
      }
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'exportToken.update',
        entityType: 'ExportToken',
        entityId: 'token-1'
      })
    }));
  });

  it('deactivates export tokens instead of hard deleting them', async () => {
    vi.mocked(prisma.exportToken.update).mockResolvedValue({
      id: 'token-1',
      name: 'Jellyfin token',
      token: 'abcdef1234567890',
      profileId: null,
      providerId: null,
      active: false,
      requests: 12,
      lastUsedAt: null,
      createdAt: new Date('2026-06-12T12:00:00.000Z')
    } as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .delete('/api/export-tokens/token-1')
      .set('x-admin-token', 'test-admin-token');

    expect(response.status).toBe(204);
    expect(prisma.exportToken.update).toHaveBeenCalledWith({
      where: {
        id: 'token-1'
      },
      data: {
        active: false
      }
    });
  });

  it('updates API key lifecycle fields without exposing hashes', async () => {
    vi.mocked(prisma.apiKey.update).mockResolvedValue({
      id: 'api-key-1',
      name: 'Ops key',
      prefix: 'ak_123456789',
      hash: 'secret-hash',
      role: 'operator',
      active: false,
      requests: 10,
      lastUsedAt: null,
      createdAt: new Date('2026-06-13T10:00:00.000Z'),
      updatedAt: new Date('2026-06-13T11:00:00.000Z')
    } as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    const app = await loadApp();
    const response = await request(app)
      .patch('/api/admin/api-keys/api-key-1')
      .set('x-admin-token', 'test-admin-token')
      .send({
        name: 'Ops key',
        role: 'operator',
        active: false
      });

    expect(response.status).toBe(200);
    expect(response.body.hash).toBeUndefined();
    expect(response.body.keyPreview).toBe('ak_123456789...');
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: {
        id: 'api-key-1'
      },
      data: {
        name: 'Ops key',
        role: 'operator',
        active: false
      }
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'apiKey.update',
        entityType: 'ApiKey',
        entityId: 'api-key-1'
      })
    }));
  });

  it('rejects empty update payloads on admin lifecycle routes', async () => {
    const app = await loadApp();
    const response = await request(app)
      .patch('/api/admin/api-keys/api-key-1')
      .set('x-admin-token', 'test-admin-token')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request payload.');
    expect(response.body.issues[0].message).toContain('At least one update field');
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });
});
