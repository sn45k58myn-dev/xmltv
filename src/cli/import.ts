import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';
import { getConfiguredSources } from '../sources/sourceRegistry';

async function main() {
  for (const source of getConfiguredSources()) {
    console.log(`Importing ${source.name}`);

    const result = await runImport(source);

    console.log(result);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());