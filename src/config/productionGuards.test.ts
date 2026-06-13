import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadGuardWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();

  for (const key of ['NODE_ENV', 'ADMIN_TOKEN', 'DATABASE_URL']) {
    delete process.env[key];
  }

  Object.assign(process.env, env);

  return import('./productionGuards');
}

describe('assertProductionSafeConfig', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    delete process.env.ADMIN_TOKEN;
    delete process.env.DATABASE_URL;
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
      ADMIN_TOKEN: 'safe-production-token',
      DATABASE_URL: 'postgresql://xmltv:xmltv@localhost:5432/xmltv'
    });

    expect(() => assertProductionSafeConfig()).toThrow('development DATABASE_URL');
  });
});
