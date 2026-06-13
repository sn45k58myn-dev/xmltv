import { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function responseMock() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  } as unknown as Response;
}

function requestMock(headers: Record<string, string> = {}) {
  return {
    header: (name: string) => headers[name.toLowerCase()]
  } as Request;
}

async function loadMonitoringAuth(token?: string) {
  vi.resetModules();

  if (token) {
    process.env.MONITORING_TOKEN = token;
  } else {
    delete process.env.MONITORING_TOKEN;
  }

  return import('./monitoringAuth');
}

describe('requireMonitoringToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONITORING_TOKEN;
  });

  it('allows monitoring when no token is configured', async () => {
    const { requireMonitoringToken } = await loadMonitoringAuth();
    const next = vi.fn() as NextFunction;

    requireMonitoringToken(requestMock(), responseMock(), next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects monitoring requests without the configured token', async () => {
    const { requireMonitoringToken } = await loadMonitoringAuth('metrics-secret');
    const res = responseMock();
    const next = vi.fn() as NextFunction;

    requireMonitoringToken(requestMock(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts monitoring token headers', async () => {
    const { requireMonitoringToken } = await loadMonitoringAuth('metrics-secret');
    const next = vi.fn() as NextFunction;

    requireMonitoringToken(
      requestMock({
        'x-monitoring-token': 'metrics-secret'
      }),
      responseMock(),
      next
    );

    expect(next).toHaveBeenCalled();
  });
});
