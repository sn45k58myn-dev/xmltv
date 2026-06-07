import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db/prisma';
import { exportCategory, exportCountry } from '../exports/exportService';

async function main() {
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(path.join('data', 'uk.xml'), await exportCountry('uk'));
  await fs.writeFile(path.join('data', 'us.xml'), await exportCountry('us'));
  await fs.writeFile(path.join('data', 'sports.xml'), await exportCategory('sports'));
  await fs.writeFile(path.join('data', 'movies.xml'), await exportCategory('movies'));
  console.log('Exports written to data/*.xml');
}

main().finally(() => prisma.$disconnect());
