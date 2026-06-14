import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/prisma', () => ({
  prisma: {
    jobRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}));

import { prisma } from '../db/prisma';
import { runTrackedJob, startJobRun } from './jobRuns';

describe('jobRuns', () => {
  it('creates runs with actor and requestId metadata', async () => {
    vi.mocked(prisma.jobRun.create).mockResolvedValue({
      id: 'run-1'
    } as any);

    await startJobRun('manual-imports', 'manual', {
      actor: 'admin-token',
      requestId: 'req-123'
    });

    expect(prisma.jobRun.create).toHaveBeenCalledWith({
      data: {
        name: 'manual-imports',
        trigger: 'manual',
        actor: 'admin-token',
        requestId: 'req-123',
        status: 'running'
      }
    });
  });

  it('propagates actor and requestId through tracked jobs', async () => {
    vi.mocked(prisma.jobRun.create).mockResolvedValue({
      id: 'run-2',
      startedAt: new Date('2026-06-14T00:00:00Z')
    } as any);
    vi.mocked(prisma.jobRun.findUnique).mockResolvedValue({
      startedAt: new Date('2026-06-14T00:00:00Z')
    } as any);
    vi.mocked(prisma.jobRun.update).mockResolvedValue({
      id: 'run-2',
      status: 'success'
    } as any);

    const result = await runTrackedJob(
      'manual-imports',
      'manual',
      async () => 'ok',
      () => 'done',
      {
        actor: 'operator',
        requestId: 'req-op'
      }
    );

    expect(result).toBe('ok');
    expect(prisma.jobRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actor: 'operator',
        requestId: 'req-op'
      })
    }));
    expect(prisma.jobRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'success'
      }),
      where: { id: 'run-2' }
    }));
  });
});
