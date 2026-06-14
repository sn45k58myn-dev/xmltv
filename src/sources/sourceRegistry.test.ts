import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

async function loadSources() {
  vi.resetModules();

  const { getConfiguredSources } = await import('./sourceRegistry');

  return getConfiguredSources();
}

describe('sourceRegistry', () => {
  const originalCustom = process.env.CUSTOM_XMLTV_URLS;
  const originalWebgrab = process.env.WEBGRAB_SOURCE_FILES;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.CUSTOM_XMLTV_URLS = originalCustom;
    process.env.WEBGRAB_SOURCE_FILES = originalWebgrab;
  });

  it('adds custom urls and local webgrab files as upload sources', async () => {
    process.env.CUSTOM_XMLTV_URLS = 'https://example.com/remote.xml, ./seeds/local.xml';
    process.env.WEBGRAB_SOURCE_FILES = './webgrab/data/guide.xml';

    const sources = await loadSources();

    expect(sources.map((source) => source.name)).toContain('Custom XMLTV 1');
    expect(sources.map((source) => source.name)).toContain('Custom XMLTV 2');
    expect(sources.map((source) => source.name)).toContain('WebGrab guide.xml');

    const remoteSource = sources.find((source) => source.name === 'Custom XMLTV 1');
    expect(remoteSource?.type).toBe('custom-url');
    expect(remoteSource?.url).toBe('https://example.com/remote.xml');

    const localSource = sources.find((source) => source.name === 'Custom XMLTV 2');
    expect(localSource?.type).toBe('upload');
    expect(path.normalize(localSource?.url ?? '')).toMatch(/seeds[\\/]local\.xml$/);

    const webgrabSource = sources.find((source) => source.name === 'WebGrab guide.xml');
    expect(webgrabSource?.type).toBe('upload');
    expect(path.normalize(webgrabSource?.url ?? '')).toMatch(/webgrab[\\/]data[\\/]guide\.xml$/);
  });
});
