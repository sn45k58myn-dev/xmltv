import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db/prisma';

vi.mock('./db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
    source: {
      findMany: vi.fn(),
      count: vi.fn()
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
      count: vi.fn()
    },
    exportToken: {
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
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
    expect(response.body.error).toContain('Admin token required');
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
});
