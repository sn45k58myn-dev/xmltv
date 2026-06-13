import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadEnvWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();

  const keys = [
    'RATE_LIMIT_MAX',
    'ENABLE_WORKER',
    'PORT',
    'SOURCE_FETCH_MAX_MB',
    'SOURCE_FETCH_RETRIES'
  ];

  for (const key of keys) {
    delete process.env[key];
  }

  Object.assign(process.env, overrides);

  return import('./env');
}

describe('env', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.ENABLE_WORKER;
    delete process.env.PORT;
    delete process.env.SOURCE_FETCH_MAX_MB;
    delete process.env.SOURCE_FETCH_RETRIES;
  });

  it('rejects invalid positive integer settings', async () => {
    await expect(loadEnvWith({
      RATE_LIMIT_MAX: '0'
    })).rejects.toThrow();
  });

  it('rejects invalid boolean string settings', async () => {
    await expect(loadEnvWith({
      ENABLE_WORKER: 'yes'
    })).rejects.toThrow();
  });

  it('allows non-negative retry counts', async () => {
    const { env } = await loadEnvWith({
      SOURCE_FETCH_RETRIES: '0'
    });

    expect(env.SOURCE_FETCH_RETRIES).toBe(0);
  });

  it('rejects invalid remote source download limits', async () => {
    await expect(loadEnvWith({
      SOURCE_FETCH_MAX_MB: '0'
    })).rejects.toThrow();
  });
});
