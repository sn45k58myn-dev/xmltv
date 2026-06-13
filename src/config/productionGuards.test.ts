import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadGuardWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();

  for (const key of [
    'NODE_ENV',
    'ADMIN_TOKEN',
    'ALLOW_ADMIN_QUERY_TOKEN',
    'BASE_URL',
    'CORS_ORIGIN',
    'DATABASE_URL',
    'RATE_LIMIT_STORE',
    'CACHE_METADATA_STORE',
    'JOB_QUEUE_BACKEND',
    'REDIS_URL'
  ]) {
    delete process.env[key];
  }

  Object.assign(process.env, env);

  return import('./productionGuards');
}

describe('assertProductionSafeConfig', () => {
  const safeAdminToken = 'safe-production-token-with-32-chars';

  afterEach(() => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    delete process.env.ADMIN_TOKEN;
    delete process.env.ALLOW_ADMIN_QUERY_TOKEN;
    delete process.env.BASE_URL;
    delete process.env.CORS_ORIGIN;
    delete process.env.DATABASE_URL;
    delete process.env.RATE_LIMIT_STORE;
    delete process.env.CACHE_METADATA_STORE;
    delete process.env.JOB_QUEUE_BACKEND;
    delete process.env.REDIS_URL;
  });

  it('allows local development defaults outside production', async () => {
    const { assertProductionSafeConfig } = await loadGuardWithEnv({
      NODE_ENV: 'development'
    });

    expect(() => assertProductionSafeConfig()).not.toThrow();
  });

  it('rejects the default admin token in production', async () => {
    const { assertProductionSafeConfig } = await loadGuardWithEnv({
      NODE_ENV: 'production',
      ADMIN_TOKEN: 'dev-admin-token',
      DATABASE_URL: 'postgresql://xmltv:xmltv@db.example.com:5432/xmltv'
    });

    expect(() => assertProductionSafeConfig()).toThrow('default ADMIN_TOKEN');
  });

  it('rejects local database URLs in production', async () => {
    const { assertProductionSafeConfig } = await loadGuardWithEnv({
      NODE_ENV: 'production',
      ADMIN_TOKEN: safeAdminToken,
      BASE_URL: 'https://xmltv.example.com',
      CORS_ORIGIN: 'https://xmltv.example.com',
      DATABASE_URL: 'postgresql://xmltv:xmltv@localhost:5432/xmltv'
    });

    expect(() => assertProductionSafeConfig()).toThrow('development DATABASE_URL');
  });

  it('rejects admin query tokens in production', async () => {
    const { assertProductionSafeConfig } = await loadGuardWithEnv({
      NODE_ENV: 'production',
      ADMIN_TOKEN: safeAdminToken,
      ALLOW_ADMIN_QUERY_TOKEN: 'true',
      DATABASE_URL: 'postgresql://xmltv:xmltv@db.example.com:5432/xmltv'
    });

    expect(() => assertProductionSafeConfig()).toThrow('ALLOW_ADMIN_QUERY_TOKEN');
  });

  it('rejects short admin tokens in production', async () => {
    const { assertProductionSafeConfig } = await loadGuardWithEnv({
      NODE_ENV: 'production',
      ADMIN_TOKEN: 'short-token',
      DATABASE_URL: 'postgresql://xmltv:xmltv@db.example.com:5432/xmltv'
    });

    expect(() => assertProductionSafeConfig()).toThrow('ADMIN_TOKEN shorter');
  });

  it('rejects wildcard CORS in production', async () => {
    const { assertProductionSafeConfig } = await loadGuardWithEnv({
      NODE_ENV: 'production',
      ADMIN_TOKEN: safeAdminToken,
      CORS_ORIGIN: '*',
      DATABASE_URL: 'postgresql://xmltv:xmltv@db.example.com:5432/xmltv'
    });

    expect(() => assertProductionSafeConfig()).toThrow('wildcard CORS_ORIGIN');
  });

  it('rejects non-HTTPS base URLs in production', async () => {
    const { assertProductionSafeConfig } = await loadGuardWithEnv({
      NODE_ENV: 'production',
      ADMIN_TOKEN: safeAdminToken,
      BASE_URL: 'http://xmltv.example.com',
      CORS_ORIGIN: 'https://xmltv.example.com',
      DATABASE_URL: 'postgresql://xmltv:xmltv@db.example.com:5432/xmltv'
    });

    expect(() => assertProductionSafeConfig()).toThrow('non-HTTPS BASE_URL');
  });

  it('rejects Redis-backed production features without REDIS_URL', async () => {
    const { assertProductionSafeConfig } = await loadGuardWithEnv({
      NODE_ENV: 'production',
      ADMIN_TOKEN: safeAdminToken,
      BASE_URL: 'https://xmltv.example.com',
      CORS_ORIGIN: 'https://xmltv.example.com',
      DATABASE_URL: 'postgresql://xmltv:xmltv@db.example.com:5432/xmltv',
      JOB_QUEUE_BACKEND: 'bullmq'
    });

    expect(() => assertProductionSafeConfig()).toThrow('REDIS_URL missing');
  });

  it('allows Redis-backed production features with REDIS_URL', async () => {
    const { assertProductionSafeConfig } = await loadGuardWithEnv({
      NODE_ENV: 'production',
      ADMIN_TOKEN: safeAdminToken,
      BASE_URL: 'https://xmltv.example.com',
      CORS_ORIGIN: 'https://xmltv.example.com',
      DATABASE_URL: 'postgresql://xmltv:xmltv@db.example.com:5432/xmltv',
      JOB_QUEUE_BACKEND: 'bullmq',
      REDIS_URL: 'redis://redis:6379'
    });

    expect(() => assertProductionSafeConfig()).not.toThrow();
  });
});
