import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadEnvWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();

  const keys = [
    'RATE_LIMIT_MAX',
    'ENABLE_WORKER',
    'PORT',
    'SOURCE_FETCH_MAX_MB',
    'SOURCE_FETCH_MAX_REDIRECTS',
    'SOURCE_FETCH_RETRIES',
    'WORKER_SHUTDOWN_TIMEOUT_MS',
    'CUSTOM_XMLTV_URLS',
    'WEBGRAB_SOURCE_FILES'
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
    delete process.env.SOURCE_FETCH_MAX_REDIRECTS;
    delete process.env.SOURCE_FETCH_RETRIES;
    delete process.env.WORKER_SHUTDOWN_TIMEOUT_MS;
    delete process.env.CUSTOM_XMLTV_URLS;
    delete process.env.WEBGRAB_SOURCE_FILES;
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
      SOURCE_FETCH_RETRIES: '0',
      SOURCE_FETCH_MAX_REDIRECTS: '0'
    });

    expect(env.SOURCE_FETCH_RETRIES).toBe(0);
    expect(env.SOURCE_FETCH_MAX_REDIRECTS).toBe(0);
  });

  it('rejects invalid remote source download limits', async () => {
    await expect(loadEnvWith({
      SOURCE_FETCH_MAX_MB: '0'
    })).rejects.toThrow();
  });

  it('rejects invalid worker shutdown timeouts', async () => {
    await expect(loadEnvWith({
      WORKER_SHUTDOWN_TIMEOUT_MS: '0'
    })).rejects.toThrow();
  });

  it('parses custom XMLTV and WebGrab source list values', async () => {
    const {
      customXmltvUrls,
      webgrabSourceFiles
    } = await loadEnvWith({
      CUSTOM_XMLTV_URLS: 'https://a.example/guide.xml, /app/data/webgrab/guide.xml',
      WEBGRAB_SOURCE_FILES: './webgrab/data/manual.xml,   '
    });

    expect(customXmltvUrls).toEqual([
      'https://a.example/guide.xml',
      '/app/data/webgrab/guide.xml'
    ]);

    expect(webgrabSourceFiles).toEqual([
      './webgrab/data/manual.xml'
    ]);
  });
});
