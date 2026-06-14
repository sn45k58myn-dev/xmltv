const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const {
  buildCountries,
  locateSiteIniRoot,
  listSiteIniCountryDirectories
} = require('./webgrab-generate-config');
require('dotenv/config');

const ROOT_DIR = process.cwd();
const ENV_FILE = path.join(ROOT_DIR, '.env');
const WEBGRAB_WORKDIR = path.resolve(process.env.WEBGRAB_WORKDIR || 'webgrab');
const WEBGRAB_OUTPUT_FILE = process.env.WEBGRAB_OUTPUT_FILE || 'guide.xml';
const OUTPUT_PATH = path.isAbsolute(WEBGRAB_OUTPUT_FILE)
  ? WEBGRAB_OUTPUT_FILE
  : path.join(WEBGRAB_WORKDIR, WEBGRAB_OUTPUT_FILE);

function quoteCommand(value) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function executableCandidates() {
  return [
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
  ].filter(Boolean);
}

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true
  });
}

function detectExecutableCommand() {
  for (const candidate of executableCandidates()) {
    if (fs.existsSync(candidate)) {
      return quoteCommand(candidate);
    }
  }

  const result = run(
    process.platform === 'win32' ? 'where.exe' : 'which',
    process.platform === 'win32'
      ? ['WebGrab+Plus.exe']
      : ['WebGrab+Plus']
  );
  const first = result.stdout
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return first ? quoteCommand(first) : undefined;
}

function detectDocker() {
  return run('docker', ['--version']).status === 0;
}

function readEnvFile() {
  return fs.existsSync(ENV_FILE)
    ? fs.readFileSync(ENV_FILE, 'utf8')
    : '';
}

function upsertEnvValue(text, key, value) {
  const rendered = `${key}=${value}`;
  const expression = new RegExp(`^${key}=.*$`, 'm');

  if (expression.test(text)) {
    return text.replace(expression, rendered);
  }

  return `${text.trimEnd()}\n${rendered}\n`;
}

async function configureEnv(command) {
  if (!command) {
    return false;
  }

  let text = readEnvFile();
  text = upsertEnvValue(text, 'WEBGRAB_ENABLED', 'true');
  text = upsertEnvValue(text, 'WEBGRAB_COMMAND', command);
  text = upsertEnvValue(text, 'WEBGRAB_WORKDIR', WEBGRAB_WORKDIR);
  text = upsertEnvValue(text, 'WEBGRAB_OUTPUT_FILE', path.basename(OUTPUT_PATH));
  text = upsertEnvValue(text, 'WEBGRAB_REGISTER_SITEINI_SOURCES', 'true');
  text = upsertEnvValue(text, 'WEBGRAB_SITEINI_SOURCE_ENABLED', 'true');

  await fsp.writeFile(ENV_FILE, text, 'utf8');
  return true;
}

async function sourceCounts() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const prisma = new PrismaClient();

  try {
    return {
      total: await prisma.source.count(),
      webgrabCountries: await prisma.source.count({
        where: {
          type: 'webgrab-country'
        }
      }),
      enabledWebgrabCountries: await prisma.source.count({
        where: {
          type: 'webgrab-country',
          enabled: true
        }
      })
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const shouldConfigure = process.argv.includes('--write-env');
  const executableCommand = detectExecutableCommand();
  const dockerAvailable = detectDocker();
  const siteIniRoot = locateSiteIniRoot();
  const countryDirectories = listSiteIniCountryDirectories(siteIniRoot);
  const configCountries = buildCountries();
  const outputExists = fs.existsSync(OUTPUT_PATH);
  const counts = await sourceCounts();

  if (shouldConfigure && executableCommand) {
    await configureEnv(executableCommand);
  }

  const report = {
    ok: Boolean(executableCommand || dockerAvailable),
    executableCommand,
    dockerAvailable,
    siteIniRoot,
    siteIniCountryDirectories: countryDirectories.length,
    generatedConfigCountries: configCountries.length,
    outputPath: OUTPUT_PATH,
    outputExists,
    databaseSources: counts,
    envUpdated: Boolean(shouldConfigure && executableCommand),
    nextStep: executableCommand
      ? shouldConfigure
        ? 'Restart the app, then run WebGrab+ from the admin dashboard.'
        : 'Run npm run webgrab:configure to write WEBGRAB_COMMAND to .env.'
      : dockerAvailable
        ? 'Start the webgrabplus container with docker compose --profile webgrab up -d webgrabplus.'
        : 'Install WebGrab+Plus from https://webgrabplus.com/download or install Docker Desktop.'
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
