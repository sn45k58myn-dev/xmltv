import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { exportProfile } from './exportService';

vi.mock('../db/prisma', () => ({
  prisma: {
    exportProfile: {
      findUniqueOrThrow: vi.fn()
    },
    channel: {
      findMany: vi.fn()
    }
  }
}));

describe('exportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trims and deduplicates profile channel ids before querying channels', async () => {
    vi.mocked(prisma.exportProfile.findUniqueOrThrow).mockResolvedValue({
      id: 'profile-1',
      country: null,
      category: null,
      channelIds: JSON.stringify([
        'channel-1',
        ' channel-2 ',
        'channel-1'
      ])
    } as any);
    vi.mocked(prisma.channel.findMany).mockResolvedValue([]);

    await exportProfile('profile-1');

    expect(prisma.channel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: {
          in: [
            'channel-1',
            'channel-2'
          ]
        }
      }
    }));
  });

  it('rejects malformed profile channel id lists clearly', async () => {
    vi.mocked(prisma.exportProfile.findUniqueOrThrow).mockResolvedValue({
      id: 'profile-1',
      country: null,
      category: null,
      channelIds: '{"not":"an array"}'
    } as any);

    await expect(exportProfile('profile-1')).rejects.toThrow('JSON array of channel ids');
    expect(prisma.channel.findMany).not.toHaveBeenCalled();
  });
});
