import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runImport: vi.fn(),
  rebuildFeeds: vi.fn()
}));

vi.mock('../pipeline/importPipeline', () => ({
  runImport: mocks.runImport
}));

vi.mock('./feedGenerator', () => ({
  rebuildFeeds: mocks.rebuildFeeds
}));

const WEBGRAB_ENV_KEYS = [
  'WEBGRAB_ENABLED',
  'WEBGRAB_COMMAND',
  'WEBGRAB_WORKDIR',
  'WEBGRAB_OUTPUT_FILE',
  'WEBGRAB_SOURCE_NAME',
  'WEBGRAB_SOURCE_PRIORITY',
  'WEBGRAB_SOURCE_MERGE_WEIGHT',
  'WEBGRAB_TIMEOUT_MS',
  'WEBGRAB_MAX_OUTPUT_MB',
  'WEBGRAB_REBUILD_FEEDS'
];

async function createWorkdir() {
  return fs.mkdtemp(path.join(
    os.tmpdir(),
    'xmltv-webgrab-'
  ));
}

function resetWebGrabEnv() {
  for (const key of WEBGRAB_ENV_KEYS) {
    delete process.env[key];
  }
}

async function loadRunnerWithEnv(env: Record<string, string>) {
  vi.resetModules();
  resetWebGrabEnv();
  Object.assign(
    process.env,
    env
  );

  return import('./webgrabRunner');
}

describe('webgrabRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runImport.mockResolvedValue({
      id: 'import-1',
      status: 'success'
    } as any);
    mocks.rebuildFeeds.mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    resetWebGrabEnv();
    vi.resetModules();
  });

  it('reports disabled status without exposing a command', async () => {
    const workdir = await createWorkdir();
    const { getWebGrabStatus } = await loadRunnerWithEnv({
      WEBGRAB_WORKDIR: workdir
    });

    await expect(getWebGrabStatus()).resolves.toMatchObject({
      enabled: false,
      commandConfigured: false,
      output: {
        exists: false
      }
    });
  });

  it('runs the configured command, validates guide.xml, imports it, and rebuilds feeds', async () => {
    const workdir = await createWorkdir();
    const writer = path.join(
      workdir,
      'write-guide.js'
    );

    await fs.writeFile(
      writer,
      [
        'const fs = require("fs");',
        'fs.writeFileSync("guide.xml", `<tv>',
        '<channel id="wg.one"><display-name>WG One</display-name></channel>',
        '<programme channel="wg.one" start="20260614090000 +0000" stop="20260614100000 +0000"><title>Morning</title></programme>',
        '</tv>`);'
      ].join('\n')
    );

    const { runWebGrabImport } = await loadRunnerWithEnv({
      WEBGRAB_ENABLED: 'true',
      WEBGRAB_COMMAND: `"${process.execPath}" "${writer}"`,
      WEBGRAB_WORKDIR: workdir,
      WEBGRAB_SOURCE_NAME: 'WebGrab Test',
      WEBGRAB_SOURCE_PRIORITY: '88',
      WEBGRAB_SOURCE_MERGE_WEIGHT: '44',
      WEBGRAB_TIMEOUT_MS: '30000',
      WEBGRAB_REBUILD_FEEDS: 'true'
    });

    const result = await runWebGrabImport();

    expect(result).toMatchObject({
      status: 'success',
      sourceName: 'WebGrab Test',
      channels: 1,
      programs: 1,
      feedsRebuilt: true
    });
    expect(mocks.runImport).toHaveBeenCalledWith({
      name: 'WebGrab Test',
      type: 'upload',
      url: path.join(
        workdir,
        'guide.xml'
      ),
      priority: 88,
      mergeWeight: 44
    });
    expect(mocks.rebuildFeeds).toHaveBeenCalledOnce();
  });

  it('rejects runs when WebGrab+Plus is disabled', async () => {
    const workdir = await createWorkdir();
    const { runWebGrabImport } = await loadRunnerWithEnv({
      WEBGRAB_WORKDIR: workdir
    });

    await expect(runWebGrabImport()).rejects.toThrow('WebGrab+Plus importer is disabled');
    expect(mocks.runImport).not.toHaveBeenCalled();
  });
});
