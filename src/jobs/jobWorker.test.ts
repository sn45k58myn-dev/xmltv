import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env', () => ({
  env: {
    ENABLE_WORKER: 'true',
    WORKER_POLL_MS: 1000,
    WORKER_SHUTDOWN_TIMEOUT_MS: 30000
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

  it('waits for an active queue job during graceful shutdown', async () => {
    const jobQueue = await import('./jobQueue');
    let resolveClaim: (value: unknown) => void = () => undefined;

    vi.mocked(jobQueue.claimNextJob).mockReturnValue(new Promise((resolve) => {
      resolveClaim = resolve;
    }) as any);

    const { startJobWorker } = await import('./jobWorker');
    const close = startJobWorker();
    let closed = false;
    const closePromise = close?.().then(() => {
      closed = true;
    });

    await Promise.resolve();
    expect(closed).toBe(false);

    resolveClaim(null);
    await closePromise;

    expect(closed).toBe(true);
  });
});
