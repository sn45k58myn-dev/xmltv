import { prisma } from '../db/prisma';
import { env } from '../config/env';

export async function runProgramRetention() {
  const cutoff = new Date();

  cutoff.setDate(
    cutoff.getDate() - env.PROGRAM_RETENTION_DAYS
  );

  const result = await prisma.program.deleteMany({
    where: {
      stop: {
        lt: cutoff
      }
    }
  });

  console.log(
    `Program retention removed ${result.count} rows older than ${env.PROGRAM_RETENTION_DAYS} days`
  );

  return result.count;
}
