import cron from 'node-cron';
import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';

export function startImportScheduler() {
  console.log('Import scheduler started');

  // Run every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('Starting scheduled imports...');

    try {
      const sources = await prisma.source.findMany({
        where: {
          enabled: true
        }
      });

      for (const source of sources) {
        try {
          await runImport({
            name: source.name,
            type: source.type as any,
            url: source.url ?? undefined,
            priority: source.priority
          });

          console.log(`Imported ${source.name}`);
        } catch (err) {
          console.error(`Import failed for ${source.name}`, err);
        }
      }
    } catch (err) {
      console.error('Scheduler error', err);
    }
  });
}