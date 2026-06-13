import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db/prisma';

vi.mock('./db/prisma', () => ({
  prisma: {
    source: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn()
    },
    channel: {
      findMany: vi.fn(),
      count: vi.fn()
    },
    program: {
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
    },
    feedDownload: {
      upsert: vi.fn()
    }
  }
}));

async function loadApp() {
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.PUBLIC_EXPORTS = 'false';
  process.env.RATE_LIMIT_MAX = '1000';

  const serverModule = await import('./server');

  return serverModule.app;
}

describe('server security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires admin auth for uploads', async () => {
    const app = await loadApp();
    const response = await request(app)
      .post('/imports/upload')
      .attach('xmltv', Buffer.from('<tv></tv>'), 'guide.xml');

    expect(response.status).toBe(401);
  });

  it('requires export token for generated feeds', async () => {
    const app = await loadApp();
    const response = await request(app).get('/country/GB.xml');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Export token required');
  });

  it('rejects invalid export tokens', async () => {
    vi.mocked(prisma.exportToken.findUnique).mockResolvedValue(null);

    const app = await loadApp();
    const response = await request(app)
      .get('/country/GB.xml')
      .set('x-export-token', 'bad');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Invalid or inactive export token');
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
});
