import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduledTasks = [
  { stop: vi.fn() },
  { stop: vi.fn() },
  { stop: vi.fn() }
];

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((_expression: string, _callback: () => Promise<void>) =>
      scheduledTasks.shift()
    )
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
});
