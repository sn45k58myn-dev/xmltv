import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';
import { shouldBackoffSource, withImportTimeout } from '../services/sourceReliability';

type ImportWorkResult = {
  sourceId?: string;
  status: string;
  errors?: string;
  skippedReason?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runEnabledImports() {
  const sources = await prisma.source.findMany({
    where: {
      enabled: true
    },
    orderBy: {
      priority: 'asc'
    }
  });
  const importResults: ImportWorkResult[] = [];

  for (const source of sources) {
    if (await shouldBackoffSource(source.id)) {
      importResults.push({
        sourceId: source.id,
        status: 'skipped',
        skippedReason: 'recent failure backoff'
      });
      continue;
    }

    try {
      const result = await withImportTimeout(
        source.name,
        runImport({
          name: source.name,
          type: source.type,
          url: source.url ?? undefined,
          priority: source.priority,
          mergeWeight: source.mergeWeight
        })
      );

      importResults.push({
        sourceId: source.id,
        ...result
      });
    } catch (error) {
      importResults.push({
        sourceId: source.id,
        status: 'failed',
        errors: errorMessage(error)
      });
    }
  }

  return importResults;
}

export function summarizeImportResults(
  importResults: Array<{ status: string }>
) {
  const skipped = importResults.filter((result) => result.status === 'skipped').length;
  const failed = importResults.filter((result) => result.status === 'failed').length;
  const imported = importResults.length - skipped - failed;

  return `Imported ${imported}, skipped ${skipped}, failed ${failed}`;
}
