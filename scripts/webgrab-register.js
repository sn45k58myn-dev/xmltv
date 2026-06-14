const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { listSiteIniCountryDirectories } = require('./webgrab-generate-config');
require('dotenv/config');

const prisma = new PrismaClient();
const REGISTER_SITEINI_SOURCES = process.env.WEBGRAB_REGISTER_SITEINI_SOURCES !== 'false';
const SITEINI_SOURCE_ENABLED = process.env.WEBGRAB_SITEINI_SOURCE_ENABLED !== 'false';

function parseList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolvePath(filePath) {
  const trimmed = filePath.trim();

  if (
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\\\') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
  ) {
    return path.resolve(process.cwd(), trimmed);
  }

  return trimmed;
}

function pickSourceName(filePath) {
  const base = path.basename(filePath);

  if (!base) {
    return 'WebGrab Source';
  }

  return `WebGrab ${path.parse(filePath).name}`;
}

async function upsertWebGrabSource(filePath) {
  const absPath = resolvePath(filePath);

  if (!fs.existsSync(absPath)) {
    console.log(`Skipping missing WebGrab file: ${filePath}`);
    return;
  }

  const name = pickSourceName(absPath);

  const source = await prisma.source.upsert({
    where: { name },
    create: {
      name,
      type: 'upload',
      url: absPath,
      priority: 90,
      enabled: true
    },
    update: {
      type: 'upload',
      url: absPath,
      priority: 90,
      enabled: true
    }
  });

  console.log(`Registered ${absPath} as ${name} (${source.id})`);
}

function countrySourceName(countryName) {
  return `WebGrab+ ${countryName}`;
}

async function upsertWebGrabCountrySource(country) {
  const name = countrySourceName(country.name);
  const source = await prisma.source.upsert({
    where: { name },
    create: {
      name,
      type: 'webgrab-country',
      url: country.path,
      priority: 70,
      enabled: SITEINI_SOURCE_ENABLED
    },
    update: {
      type: 'webgrab-country',
      url: country.path,
      priority: 70,
      enabled: SITEINI_SOURCE_ENABLED
    }
  });

  console.log(`Registered WebGrab+ country catalog source ${country.name} (${source.id})`);
}

async function main() {
  const webgrabSources = parseList(process.env.WEBGRAB_SOURCE_FILES);

  const files = [...new Set(webgrabSources.map((value) => value.trim()).filter(Boolean))];

  for (const filePath of files) {
    await upsertWebGrabSource(filePath);
  }

  if (REGISTER_SITEINI_SOURCES) {
    const countries = listSiteIniCountryDirectories();

    if (!countries.length && !files.length) {
      throw new Error('No WebGrab siteini country directories or WEBGRAB_SOURCE_FILES found. Run npm run webgrab:prepare first.');
    }

    for (const country of countries) {
      await upsertWebGrabCountrySource(country);
    }
  } else if (!files.length) {
    throw new Error('No WEBGRAB_SOURCE_FILES configured. Set WEBGRAB_SOURCE_FILES=/app/data/webgrab/guide.xml and retry.');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  prisma.$disconnect().finally(() => {
    console.error(error.message);
    process.exit(1);
  });
});
