import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { getAuditEvents, maskExportToken, maskSecret } from './auditLog';

vi.mock('../db/prisma', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn()
    }
  }
}));

describe('auditLog helpers', () => {
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
});
