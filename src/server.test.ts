import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db/prisma';

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
    channel: {
      findMany: vi.fn(),
      count: vi.fn()
    },
    program: {
      findMany: vi.fn(),
      count: vi.fn()
    },
    alias: {
      count: vi.fn()
    },
    exportProfile: {
      count: vi.fn(),
      create: vi.fn()
    },
    importRun: {
      count: vi.fn(),
      findFirst: vi.fn()
    },
    exportToken: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn()
    },
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn()
    }
  }
}));

async function loadApp() {
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.PUBLIC_EXPORTS = 'false';
  process.env.ENABLE_SCHEDULER = 'false';
  process.env.RATE_LIMIT_MAX = '1000';

  const serverModule = await import('./server');

  return serverModule.app;
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

    const app = await loadApp();
    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      database: true
    });
  });

  it('rejects admin routes without an admin token', async () => {
    const app = await loadApp();
    const response = await request(app).get('/api/admin/summary');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Admin credentials required');
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
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as any);
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
    expect(prisma.apiKey.update).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'api-key-1'
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
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as any);
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
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as any);

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

  it('rejects protected feeds when the export token is invalid', async () => {
    vi.mocked(prisma.exportToken.findUnique).mockResolvedValue(null);

    const app = await loadApp();
    const response = await request(app)
      .get('/country/GB.xml')
      .set('x-export-token', 'bad-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Invalid or inactive export token');
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

    expect(response.status).toBe(204);
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
