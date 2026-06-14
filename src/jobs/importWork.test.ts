import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';
import { shouldBackoffSource, withImportTimeout } from '../services/sourceReliability';
import { runEnabledImports, summarizeImportResults } from './importWork';

vi.mock('../db/prisma', () => ({
  prisma: {
    source: {
      findMany: vi.fn()
    }
  }
}));

vi.mock('../pipeline/importPipeline', () => ({
  runImport: vi.fn()
}));

vi.mock('../services/sourceReliability', () => ({
  shouldBackoffSource: vi.fn(),
  withImportTimeout: vi.fn()
}));

const sources = [
  {
    id: 'source-1',
    name: 'Primary',
    type: 'url',
    url: 'https://example.com/primary.xml',
    priority: 1,
    mergeWeight: 25
  },
  {
    id: 'source-2',
    name: 'Backup',
    type: 'url',
    url: 'https://example.com/backup.xml',
    priority: 2,
    mergeWeight: 75
  }
];

describe('import work', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.source.findMany).mockResolvedValue(sources as any);
    vi.mocked(shouldBackoffSource).mockResolvedValue(false);
    vi.mocked(withImportTimeout).mockImplementation(async (_sourceName, task) => task);
  });

  it('runs enabled sources with timeout protection', async () => {
    vi.mocked(runImport)
      .mockResolvedValueOnce({ status: 'success', channels: 1 } as any)
      .mockResolvedValueOnce({ status: 'success', channels: 2 } as any);

    const results = await runEnabledImports();

    expect(prisma.source.findMany).toHaveBeenCalledWith({
      where: {
        enabled: true
      },
      orderBy: {
        priority: 'asc'
      }
    });
    expect(withImportTimeout).toHaveBeenCalledTimes(2);
    expect(runImport).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Primary',
      mergeWeight: 25
    }));
    expect(results).toEqual([
      expect.objectContaining({
        sourceId: 'source-1',
        status: 'success'
      }),
      expect.objectContaining({
        sourceId: 'source-2',
        status: 'success'
      })
    ]);
  });

  it('skips sources still inside failure backoff', async () => {
    vi.mocked(shouldBackoffSource).mockImplementation(async (sourceId) => sourceId === 'source-1');
    vi.mocked(runImport).mockResolvedValue({ status: 'success' } as any);

    const results = await runEnabledImports();

    expect(runImport).toHaveBeenCalledTimes(1);
    expect(runImport).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Backup'
    }));
    expect(results[0]).toEqual({
      sourceId: 'source-1',
      status: 'skipped',
      skippedReason: 'recent failure backoff'
    });
  });

  it('records per-source failures and continues the batch', async () => {
    vi.mocked(withImportTimeout)
      .mockRejectedValueOnce(new Error('upstream timed out'))
      .mockImplementationOnce(async (_sourceName, task) => task);
    vi.mocked(runImport)
      .mockResolvedValueOnce({ status: 'success' } as any)
      .mockResolvedValueOnce({ status: 'success' } as any);

    const results = await runEnabledImports();

    expect(runImport).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      {
        sourceId: 'source-1',
        status: 'failed',
        errors: 'upstream timed out'
      },
      expect.objectContaining({
        sourceId: 'source-2',
        status: 'success'
      })
    ]);
  });

  it('summarizes imported skipped and failed counts', () => {
    expect(summarizeImportResults([
      { status: 'success' },
      { status: 'skipped' },
      { status: 'failed' }
    ])).toBe('Imported 1, skipped 1, failed 1');
  });
});
