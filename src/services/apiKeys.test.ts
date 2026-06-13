import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { hashApiKey, validateApiKey } from './apiKeys';

vi.mock('../db/prisma', () => ({
  prisma: {
    apiKey: {
      updateMany: vi.fn(),
      findUnique: vi.fn()
    }
  }
}));

describe('apiKeys', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('increments usage only for active matching API keys', async () => {
    vi.mocked(prisma.apiKey.updateMany).mockResolvedValue({
      count: 1
    });
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
      id: 'api-key-1',
      name: 'Operator',
      role: 'operator',
      active: true
    } as any);

    await expect(validateApiKey('ak_test')).resolves.toEqual({
      id: 'api-key-1',
      name: 'Operator',
      role: 'operator'
    });

    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
      where: {
        hash: hashApiKey('ak_test'),
        active: true
      },
      data: {
        requests: {
          increment: 1
        },
        lastUsedAt: expect.any(Date)
      }
    });
  });

  it('rejects inactive or unknown API keys without loading key metadata', async () => {
    vi.mocked(prisma.apiKey.updateMany).mockResolvedValue({
      count: 0
    });

    await expect(validateApiKey('ak_inactive')).resolves.toBeNull();

    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });
});
