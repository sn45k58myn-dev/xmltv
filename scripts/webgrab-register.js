const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
require('dotenv/config');

const prisma = new PrismaClient();

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

async function main() {
  const webgrabSources = parseList(process.env.WEBGRAB_SOURCE_FILES);

  if (!webgrabSources.length) {
    throw new Error('No WEBGRAB_SOURCE_FILES configured. Set WEBGRAB_SOURCE_FILES=/app/data/webgrab/guide.xml and retry.');
  }

  const files = [...new Set(webgrabSources.map((value) => value.trim()).filter(Boolean))];

  for (const filePath of files) {
    await upsertWebGrabSource(filePath);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  prisma.$disconnect().finally(() => {
    console.error(error.message);
    process.exit(1);
  });
});
