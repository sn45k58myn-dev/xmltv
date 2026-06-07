import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';
import { getConfiguredSources } from '../sources/sourceRegistry';

async function main() {
  for (const source of getConfiguredSources()) console.log(await runImport(source));
}

main().finally(() => prisma.$disconnect());
