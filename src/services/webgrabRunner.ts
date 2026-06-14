import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { runImport } from '../pipeline/importPipeline';
import { parseXmltv } from '../pipeline/parseXmltv';
import { validateXmltv } from '../pipeline/validateXmltv';
import { rebuildFeeds } from './feedGenerator';

const OUTPUT_CAPTURE_BYTES = 64 * 1024;

type CommandResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

export type WebGrabRunResult = {
  status: 'success';
  sourceName: string;
  workdir: string;
  outputPath: string;
  outputBytes: number;
  outputUpdatedAt: string;
  channels: number;
  programs: number;
  durationMs: number;
  importResult: unknown;
  feedsRebuilt: boolean;
  stdout?: string;
  stderr?: string;
};

function appendCaptured(
  current: string,
  chunk: Buffer
) {
  const next = current + chunk.toString('utf8');

  return next.length > OUTPUT_CAPTURE_BYTES
    ? next.slice(next.length - OUTPUT_CAPTURE_BYTES)
    : next;
}

function resolveWorkdir() {
  return path.resolve(env.WEBGRAB_WORKDIR);
}

function resolveOutputPath(workdir: string) {
  if (path.isAbsolute(env.WEBGRAB_OUTPUT_FILE)) {
    return path.resolve(env.WEBGRAB_OUTPUT_FILE);
  }

  const outputPath = path.resolve(
    workdir,
    env.WEBGRAB_OUTPUT_FILE
  );
  const relative = path.relative(
    workdir,
    outputPath
  );

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('WEBGRAB_OUTPUT_FILE must stay inside WEBGRAB_WORKDIR when using a relative path.');
  }

  return outputPath;
}

function webGrabExecutableCandidates() {
  const candidates = [
    process.env.WEBGRAB_EXECUTABLE,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'WebGrab+Plus', 'WebGrab+Plus.exe')
      : undefined,
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, 'WebGrab+Plus', 'WebGrab+Plus.exe')
      : undefined,
    process.env['ProgramFiles(x86)']
      ? path.join(process.env['ProgramFiles(x86)'], 'WebGrab+Plus', 'WebGrab+Plus.exe')
      : undefined,
    'C:\\ProgramData\\WebGrab+Plus\\WebGrab+Plus.exe'
  ];

  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

function quoteCommand(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function detectExecutableCommand() {
  for (const candidate of webGrabExecutableCandidates()) {
    if (fsSync.existsSync(candidate)) {
      return quoteCommand(candidate);
    }
  }

  const where = spawnSync(
    process.platform === 'win32' ? 'where.exe' : 'which',
    process.platform === 'win32'
      ? ['WebGrab+Plus.exe']
      : ['WebGrab+Plus'],
    {
      encoding: 'utf8',
      windowsHide: true
    }
  );
  const first = where.stdout
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return first ? quoteCommand(first) : undefined;
}

function dockerAvailable() {
  const result = spawnSync(
    'docker',
    ['--version'],
    {
      encoding: 'utf8',
      windowsHide: true
    }
  );

  return result.status === 0;
}

export function detectWebGrabRuntime() {
  const executableCommand = detectExecutableCommand();
  const hasDocker = dockerAvailable();

  return {
    executableCommand,
    dockerAvailable: hasDocker,
    suggestedCommand: executableCommand,
    setupHint: executableCommand
      ? `Set WEBGRAB_COMMAND=${executableCommand}`
      : hasDocker
        ? 'Use docker compose --profile webgrab up -d webgrabplus and set WEBGRAB_COMMAND=true after it writes guide.xml.'
        : 'Install WebGrab+Plus from https://webgrabplus.com/download or install Docker Desktop for the webgrabplus container.'
  };
}

function assertConfigured() {
  if (env.WEBGRAB_ENABLED !== 'true') {
    throw new Error('WebGrab+Plus importer is disabled. Set WEBGRAB_ENABLED=true to enable it.');
  }

  if (!env.WEBGRAB_COMMAND?.trim()) {
    throw new Error('WEBGRAB_COMMAND is required when WEBGRAB_ENABLED=true.');
  }
}

function runWebGrabCommand(
  command: string,
  workdir: string
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(command, {
      cwd: workdir,
      shell: true,
      windowsHide: true,
      env: process.env
    });
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`WebGrab+Plus command exceeded WEBGRAB_TIMEOUT_MS (${env.WEBGRAB_TIMEOUT_MS} ms).`));
    }, env.WEBGRAB_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendCaptured(
        stdout,
        chunk
      );
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendCaptured(
        stderr,
        chunk
      );
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        exitCode,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function readAndValidateOutput(outputPath: string) {
  const stat = await fs.stat(outputPath);

  if (!stat.isFile()) {
    throw new Error(`WebGrab+Plus output is not a file: ${outputPath}`);
  }

  const maxBytes = env.WEBGRAB_MAX_OUTPUT_MB * 1024 * 1024;

  if (stat.size <= 0) {
    throw new Error('WebGrab+Plus output is empty.');
  }

  if (stat.size > maxBytes) {
    throw new Error(`WebGrab+Plus output exceeds ${env.WEBGRAB_MAX_OUTPUT_MB} MB.`);
  }

  const xml = await fs.readFile(
    outputPath,
    'utf8'
  );
  const parsed = parseXmltv(xml);

  validateXmltv(parsed);

  return {
    stat,
    parsed
  };
}

export async function getWebGrabStatus() {
  const workdir = resolveWorkdir();
  const outputPath = resolveOutputPath(workdir);
  const runtime = detectWebGrabRuntime();
  let output: {
    exists: boolean;
    bytes?: number;
    updatedAt?: string;
  } = {
    exists: false
  };

  try {
    const stat = await fs.stat(outputPath);

    output = {
      exists: stat.isFile(),
      bytes: stat.size,
      updatedAt: stat.mtime.toISOString()
    };
  } catch {
    output = {
      exists: false
    };
  }

  return {
    enabled: env.WEBGRAB_ENABLED === 'true',
    commandConfigured: Boolean(env.WEBGRAB_COMMAND?.trim()),
    runtimeDetected: Boolean(runtime.executableCommand || runtime.dockerAvailable),
    executableDetected: Boolean(runtime.executableCommand),
    dockerAvailable: runtime.dockerAvailable,
    suggestedCommand: runtime.suggestedCommand,
    setupHint: runtime.setupHint,
    workdir,
    outputPath,
    output,
    sourceName: env.WEBGRAB_SOURCE_NAME,
    priority: env.WEBGRAB_SOURCE_PRIORITY,
    mergeWeight: env.WEBGRAB_SOURCE_MERGE_WEIGHT,
    timeoutMs: env.WEBGRAB_TIMEOUT_MS,
    maxOutputMB: env.WEBGRAB_MAX_OUTPUT_MB,
    rebuildFeeds: env.WEBGRAB_REBUILD_FEEDS === 'true'
  };
}

export async function runWebGrabImport(): Promise<WebGrabRunResult> {
  assertConfigured();

  const startedAt = Date.now();
  const workdir = resolveWorkdir();
  const outputPath = resolveOutputPath(workdir);

  await fs.mkdir(
    workdir,
    {
      recursive: true
    }
  );

  const command = env.WEBGRAB_COMMAND as string;
  const commandResult = await runWebGrabCommand(
    command,
    workdir
  );

  if (commandResult.exitCode !== 0) {
    throw new Error(`WebGrab+Plus command failed with exit code ${commandResult.exitCode ?? 'null'}${commandResult.signal ? ` (${commandResult.signal})` : ''}: ${commandResult.stderr || commandResult.stdout || 'no output'}`);
  }

  const {
    stat,
    parsed
  } = await readAndValidateOutput(outputPath);
  const importResult: any = await runImport({
    name: env.WEBGRAB_SOURCE_NAME,
    type: 'upload',
    url: outputPath,
    priority: env.WEBGRAB_SOURCE_PRIORITY,
    mergeWeight: env.WEBGRAB_SOURCE_MERGE_WEIGHT
  });

  if (importResult?.status === 'failed') {
    throw new Error(`WebGrab+Plus XMLTV import failed: ${importResult.errors ?? 'unknown error'}`);
  }

  let feedsRebuilt = false;

  if (env.WEBGRAB_REBUILD_FEEDS === 'true') {
    await rebuildFeeds();
    feedsRebuilt = true;
  }

  return {
    status: 'success',
    sourceName: env.WEBGRAB_SOURCE_NAME,
    workdir,
    outputPath,
    outputBytes: stat.size,
    outputUpdatedAt: stat.mtime.toISOString(),
    channels: parsed.channels.length,
    programs: parsed.programs.length,
    durationMs: Date.now() - startedAt,
    importResult,
    feedsRebuilt,
    stdout: commandResult.stdout || undefined,
    stderr: commandResult.stderr || undefined
  };
}

export function summarizeWebGrabResult(result: WebGrabRunResult) {
  return `WebGrab+Plus imported ${result.channels} channels and ${result.programs} programmes from ${result.outputBytes} bytes${result.feedsRebuilt ? '; feeds rebuilt' : ''}`;
}
