import cron from 'node-cron';
import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';
import { runProgramRetention } from './programRetention';

let importRunning = false;

export function startImportScheduler() {
  console.log('Import scheduler started');

  // Daily imports at 03:00
  cron.schedule('0 3 * * *', async () => {
    if (importRunning) {
      console.log('Import already running, skipping schedule');
      return;
    }

    importRunning = true;

    try {
      console.log('Starting scheduled imports...');

      const sources = await prisma.source.findMany({
        where: {
          enabled: true
        },
        orderBy: {
          priority: 'asc'
        }
      });

      for (const source of sources) {
        try {
          const started = Date.now();

          await runImport({
            name: source.name,
            type: source.type as any,
            url: source.url ?? undefined,
            priority: source.priority
          });

          const seconds = Math.round(
            (Date.now() - started) / 1000
          );

          console.log(
            `Imported ${source.name} in ${seconds}s`
          );
        } catch (err) {
          console.error(
            `Import failed for ${source.name}`,
            err
          );
        }
      }
    } catch (err) {
      console.error('Scheduler error', err);
    } finally {
      importRunning = false;
    }
  });

  // Daily retention cleanup at 04:00
  cron.schedule('0 4 * * *', async () => {
    try {
      await runProgramRetention();
    } catch (err) {
      console.error(
        'Program retention failed',
        err
      );
    }
  });
}