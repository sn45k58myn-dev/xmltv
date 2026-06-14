import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { mergeChannels } from './mergeEngine';

vi.mock('../db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (callback) => callback(prisma)),
    channel: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    program: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    alias: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    mapping: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  }
}));

describe('mergeChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges channels inside one transaction and preserves source refs', async () => {
    vi.mocked(prisma.channel.findUniqueOrThrow).mockResolvedValue({
      id: 'target',
      sourceRefs: JSON.stringify([
        {
          sourceId: 'source-1',
          sourceChannelId: 'one'
        }
      ])
    } as any);
    vi.mocked(prisma.channel.findUnique).mockResolvedValue({
      id: 'merge',
      sourceRefs: JSON.stringify([
        {
          sourceId: 'source-2',
          sourceChannelId: 'two'
        }
      ])
    } as any);
    vi.mocked(prisma.alias.findMany).mockResolvedValue([]);
    vi.mocked(prisma.mapping.findMany).mockResolvedValue([]);
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      {
        id: 'program-1',
        start: new Date('2026-06-12T09:00:00Z'),
        stop: new Date('2026-06-12T10:00:00Z'),
        checksum: 'checksum-1'
      }
    ] as any);
    vi.mocked(prisma.program.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.program.update).mockResolvedValue({} as any);
    vi.mocked(prisma.channel.update).mockResolvedValue({} as any);

    await expect(mergeChannels(
      'target',
      ['merge']
    )).resolves.toMatchObject({
      success: true,
      targetChannelId: 'target',
      mergedCount: 1
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        timeout: 60_000
      }
    );
    expect(prisma.program.update).toHaveBeenCalledWith({
      where: {
        id: 'program-1'
      },
      data: {
        channelId: 'target'
      }
    });
    expect(prisma.channel.update).toHaveBeenCalledWith({
      where: {
        id: 'target'
      },
      data: {
        sourceRefs: JSON.stringify([
          {
            sourceId: 'source-1',
            sourceChannelId: 'one'
          },
          {
            sourceId: 'source-2',
            sourceChannelId: 'two'
          }
        ])
      }
    });
  });

  it('ignores malformed sourceRefs instead of failing the merge', async () => {
    vi.mocked(prisma.channel.findUniqueOrThrow).mockResolvedValue({
      id: 'target',
      sourceRefs: '{bad-json'
    } as any);
    vi.mocked(prisma.channel.findUnique).mockResolvedValue({
      id: 'merge',
      sourceRefs: '{bad-json'
    } as any);
    vi.mocked(prisma.alias.findMany).mockResolvedValue([]);
    vi.mocked(prisma.mapping.findMany).mockResolvedValue([]);
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
    vi.mocked(prisma.channel.update).mockResolvedValue({} as any);

    await expect(mergeChannels(
      'target',
      ['merge']
    )).resolves.toMatchObject({
      success: true
    });

    expect(prisma.channel.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        sourceRefs: '[]'
      }
    }));
  });

  it('drops exact duplicate programmes when merging channels', async () => {
    vi.mocked(prisma.channel.findUniqueOrThrow).mockResolvedValue({
      id: 'target',
      sourceRefs: null
    } as any);
    vi.mocked(prisma.channel.findUnique).mockResolvedValue({
      id: 'merge',
      sourceRefs: null
    } as any);
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      {
        id: 'program-duplicate',
        start: new Date('2026-06-12T09:00:00Z'),
        stop: new Date('2026-06-12T10:00:00Z'),
        checksum: 'checksum-1'
      }
    ] as any);
    vi.mocked(prisma.program.findUnique).mockResolvedValue({
      id: 'target-program'
    } as any);
    vi.mocked(prisma.alias.findMany).mockResolvedValue([]);
    vi.mocked(prisma.mapping.findMany).mockResolvedValue([]);
    vi.mocked(prisma.channel.update).mockResolvedValue({} as any);
    vi.mocked(prisma.program.delete).mockResolvedValue({} as any);

    await expect(mergeChannels(
      'target',
      ['merge']
    )).resolves.toMatchObject({
      success: true
    });

    expect(prisma.program.delete).toHaveBeenCalledWith({
      where: {
        id: 'program-duplicate'
      }
    });
    expect(prisma.program.update).not.toHaveBeenCalled();
  });
});
