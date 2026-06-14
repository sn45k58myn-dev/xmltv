import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduledTasks = [
  { stop: vi.fn() },
  { stop: vi.fn() },
  { stop: vi.fn() }
];
const scheduledCallbacks: Array<() => Promise<void>> = [];

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((_expression: string, callback: () => Promise<void>) => {
      scheduledCallbacks.push(callback);

      return scheduledTasks.shift();
    })
  }
}));

vi.mock('../db/prisma', () => ({
  prisma: {
    source: {
      findMany: vi.fn()
    }
  }
}));

vi.mock('../config/env', () => ({
  env: {
    SCHEDULER_LOCK_TTL_MS: 60000
  }
}));

vi.mock('../pipeline/importPipeline', () => ({
  runImport: vi.fn()
}));

vi.mock('./programRetention', () => ({
  runProgramRetention: vi.fn()
}));

vi.mock('./jobRuns', () => ({
  finishJobRun: vi.fn(),
  startJobRun: vi.fn()
}));

vi.mock('./jobLock', () => ({
  acquireJobLock: vi.fn()
}));

vi.mock('../services/sourceReliability', () => ({
  shouldBackoffSource: vi.fn(),
  withImportTimeout: vi.fn()
}));

vi.mock('./operationalRetention', () => ({
  runOperationalRetention: vi.fn(),
  summarizeOperationalRetention: vi.fn()
}));

describe('importScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduledCallbacks.splice(
      0,
      scheduledCallbacks.length
    );
    scheduledTasks.splice(
      0,
      scheduledTasks.length,
      { stop: vi.fn() },
      { stop: vi.fn() },
      { stop: vi.fn() }
    );
  });

  it('returns a close hook that stops scheduled cron tasks', async () => {
    const { startImportScheduler } = await import('./importScheduler');

    const tasks = [...scheduledTasks];
    const close = startImportScheduler();

    await close();

    for (const task of tasks) {
      expect(task.stop).toHaveBeenCalled();
    }
  });

  it('counts failed import results as failed scheduled imports', async () => {
    const { prisma } = await import('../db/prisma');
    const { runImport } = await import('../pipeline/importPipeline');
    const { finishJobRun, startJobRun } = await import('./jobRuns');
    const { acquireJobLock } = await import('./jobLock');
    const { shouldBackoffSource, withImportTimeout } = await import('../services/sourceReliability');
    const { startImportScheduler } = await import('./importScheduler');

    vi.mocked(prisma.source.findMany).mockResolvedValue([
      {
        id: 'source-1',
        name: 'Primary',
        type: 'url',
        url: 'https://example.com/primary.xml',
        priority: 1
      },
      {
        id: 'source-2',
        name: 'Backup',
        type: 'url',
        url: 'https://example.com/backup.xml',
        priority: 2
      }
    ] as any);
    vi.mocked(acquireJobLock).mockResolvedValue({
      release: vi.fn()
    } as any);
    vi.mocked(startJobRun).mockResolvedValue({
      id: 'job-1'
    } as any);
    vi.mocked(shouldBackoffSource).mockResolvedValue(false);
    vi.mocked(withImportTimeout).mockImplementation(async (_sourceName, task) => task);
    vi.mocked(runImport)
      .mockResolvedValueOnce({ status: 'failed' } as any)
      .mockResolvedValueOnce({ status: 'success' } as any);

    startImportScheduler();
    await scheduledCallbacks[0]();

    expect(finishJobRun).toHaveBeenCalledWith(
      'job-1',
      'failed',
      'Imported 1, failed 1'
    );
  });
});
