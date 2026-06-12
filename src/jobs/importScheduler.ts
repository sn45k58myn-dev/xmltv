import cron from 'node-cron';
import { prisma } from '../db/prisma';
import { runImport } from '../pipeline/importPipeline';
import { runProgramRetention } from './programRetention';
import { finishJobRun, startJobRun } from './jobRuns';

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
    const job = await startJobRun(
      'scheduled-imports',
      'cron'
    );
    let imported = 0;
    let failed = 0;

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
          imported++;

          const seconds = Math.round(
            (Date.now() - started) / 1000
          );

          console.log(
            `Imported ${source.name} in ${seconds}s`
          );
        } catch (err) {
          failed++;
          console.error(
            `Import failed for ${source.name}`,
            err
          );
        }
      }

      await finishJobRun(
        job.id,
        failed > 0 ? 'failed' : 'success',
        `Imported ${imported}, failed ${failed}`
      );
    } catch (err) {
      console.error('Scheduler error', err);
      await finishJobRun(
        job.id,
        'failed',
        undefined,
        err
      );
    } finally {
      importRunning = false;
    }
  });

  // Daily retention cleanup at 04:00
  cron.schedule('0 4 * * *', async () => {
    const job = await startJobRun(
      'program-retention',
      'cron'
    );

    try {
      const removed = await runProgramRetention();

      await finishJobRun(
        job.id,
        'success',
        `Removed ${removed} old programmes`
      );
    } catch (err) {
      console.error(
        'Program retention failed',
        err
      );

      await finishJobRun(
        job.id,
        'failed',
        undefined,
        err
      );
    }
  });
}
