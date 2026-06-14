import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { getSourceCategories } from './sourceCategoryService';

vi.mock('../db/prisma', () => ({
  prisma: {
    source: {
      findMany: vi.fn()
    },
    program: {
      groupBy: vi.fn()
    }
  }
}));

describe('getSourceCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.source.findMany).mockResolvedValue([
      {
        id: 'source-1',
        name: 'Example Source',
        type: 'url',
        enabled: true
      }
    ] as any);
  });

  it('displays legacy uncategorized programme rows as General', async () => {
    vi.mocked(prisma.program.groupBy)
      .mockResolvedValueOnce([
        {
          sourceId: 'source-1',
          category: 'General',
          _count: {
            _all: 5
          }
        },
        {
          sourceId: 'source-1',
          category: 'Uncategorized',
          _count: {
            _all: 3
          }
        }
      ] as any)
      .mockResolvedValueOnce([
        {
          sourceId: 'source-1',
          _count: {
            _all: 2
          }
        }
      ] as any);

    const data = await getSourceCategories();

    expect(data.categories).toEqual([
      expect.objectContaining({
        sourceId: 'source-1',
        category: 'General',
        programs: 10
      })
    ]);
    expect(data.sources[0]).toMatchObject({
      categories: 1,
      programs: 10,
      topCategories: 'General (10)'
    });
  });
});
