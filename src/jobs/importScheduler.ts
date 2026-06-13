import cron from 'node-cron';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { runImport } from '../pipeline/importPipeline';
import { runProgramRetention } from './programRetention';
import { finishJobRun, startJobRun } from './jobRuns';
import { acquireJobLock } from './jobLock';
import { shouldBackoffSource, withImportTimeout } from '../services/sourceReliability';
import { runOperationalRetention, summarizeOperationalRetention } from './operationalRetention';

export function startImportScheduler() {
  console.log('Import scheduler started');

  // Daily imports at 03:00
  cron.schedule('0 3 * * *', async () => {
    const lock = await acquireJobLock(
      'scheduled-imports',
      env.SCHEDULER_LOCK_TTL_MS
    );

    if (!lock) {
      console.log('Scheduled imports already locked, skipping schedule');
      return;
    }

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
          if (await shouldBackoffSource(source.id)) {
            console.log(
              `Skipping ${source.name}; recent failure backoff still active`
            );
            continue;
          }

          const started = Date.now();

          await withImportTimeout(
            source.name,
            runImport({
              name: source.name,
              type: source.type as any,
              url: source.url ?? undefined,
              priority: source.priority
            })
          );
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
      await lock.release();
    }
  });

  // Daily retention cleanup at 04:00
  cron.schedule('0 4 * * *', async () => {
    const lock = await acquireJobLock(
      'program-retention',
      env.SCHEDULER_LOCK_TTL_MS
    );

    if (!lock) {
      console.log('Program retention already locked, skipping schedule');
      return;
    }

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
    } finally {
      await lock.release();
    }
  });

  // Daily operational retention cleanup at 04:30
  cron.schedule('30 4 * * *', async () => {
    const lock = await acquireJobLock(
      'operational-retention',
      env.SCHEDULER_LOCK_TTL_MS
    );

    if (!lock) {
      console.log('Operational retention already locked, skipping schedule');
      return;
    }

    const job = await startJobRun(
      'operational-retention',
      'cron'
    );

    try {
      const result = await runOperationalRetention();

      await finishJobRun(
        job.id,
        'success',
        summarizeOperationalRetention(result)
      );
    } catch (err) {
      console.error(
        'Operational retention failed',
        err
      );

      await finishJobRun(
        job.id,
        'failed',
        undefined,
        err
      );
    } finally {
      await lock.release();
    }
  });
}
