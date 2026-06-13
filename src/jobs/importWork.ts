import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';

export async function runEnabledImports() {
  const sources = await prisma.source.findMany({
    where: {
      enabled: true
    },
    orderBy: {
      priority: 'asc'
    }
  });
  const importResults = [];

  for (const source of sources) {
    importResults.push(
      await runImport({
        name: source.name,
        type: source.type,
        url: source.url ?? undefined,
        priority: source.priority
      })
    );
  }

  return importResults;
}

export function summarizeImportResults(
  importResults: Array<{ status: string }>
) {
  const failed = importResults.filter((result) => result.status === 'failed').length;

  return `Imported ${importResults.length - failed}, failed ${failed}`;
}
