import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';

async function main() {
  const sources = await prisma.source.findMany({
    where: {
      enabled: true
    },
    orderBy: {
      priority: 'asc'
    }
  });

  for (const source of sources) {
    console.log(
      await runImport({
        name: source.name,
        type: source.type as any,
        url: source.url ?? undefined,
        priority: source.priority
      })
    );
  }
}

main().finally(() => prisma.$disconnect());