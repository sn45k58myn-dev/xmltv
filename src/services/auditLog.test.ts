import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { getAuditEvents, maskExportToken, maskSecret, recordAuditEvent } from './auditLog';

vi.mock('../db/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn()
    }
  }
}));

describe('auditLog helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('masks token values without returning the full secret', () => {
    expect(maskSecret('abcdef1234567890')).toBe('abcdef...7890');
    expect(maskSecret('short')).toBe('sh...rt');
  });

  it('removes token from export token list objects', () => {
    const masked = maskExportToken({
      id: 'token-1',
      token: 'abcdef1234567890',
      name: 'Main token'
    });

    expect(masked).toEqual({
      id: 'token-1',
      name: 'Main token',
      tokenPreview: 'abcdef...7890'
    });
    expect('token' in masked).toBe(false);
  });

  it('bounds invalid and excessive audit history limits', async () => {
    await getAuditEvents(Number.NaN);
    await getAuditEvents(50000);

    expect(prisma.auditLog.findMany).toHaveBeenNthCalledWith(1, {
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });
    expect(prisma.auditLog.findMany).toHaveBeenNthCalledWith(2, {
      orderBy: {
        createdAt: 'desc'
      },
      take: 500
    });
  });

  it('does not fail mutations when audit writes fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error('audit table unavailable'));

    await expect(recordAuditEvent({
      requestId: 'request-1',
      ip: '127.0.0.1'
    } as any, {
      action: 'source.create',
      entityType: 'Source',
      entityId: 'source-1'
    })).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      'Unable to record audit event source.create:',
      expect.any(Error)
    );
  });
});
