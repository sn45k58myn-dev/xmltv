import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';
import { rebuildFeeds } from '../services/feedGenerator';
import { getConfiguredSources } from '../sources/sourceRegistry';

async function main() {
  for (const source of getConfiguredSources()) {
    console.log(`Importing ${source.name}`);

    const result = await runImport(source);

    console.log(result);
  }

  console.log('Rebuilding cached feeds...');

  await rebuildFeeds();

  console.log('Cached feeds rebuilt');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());