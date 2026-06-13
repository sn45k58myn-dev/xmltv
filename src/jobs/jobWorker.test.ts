import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env', () => ({
  env: {
    ENABLE_WORKER: 'true',
    WORKER_POLL_MS: 1000
  }
}));

vi.mock('./jobQueue', () => ({
  claimNextJob: vi.fn().mockResolvedValue(null),
  createWorkerId: vi.fn().mockReturnValue('worker-1'),
  finishQueuedJob: vi.fn(),
  retryQueuedJob: vi.fn()
}));

vi.mock('./jobRuns', () => ({
  runTrackedJob: vi.fn()
}));

vi.mock('./importWork', () => ({
  runEnabledImports: vi.fn(),
  summarizeImportResults: vi.fn()
}));

describe('jobWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a close hook for graceful shutdown', async () => {
    const { startJobWorker } = await import('./jobWorker');

    const close = startJobWorker();

    expect(close).toEqual(expect.any(Function));
    await close?.();
  });
});
