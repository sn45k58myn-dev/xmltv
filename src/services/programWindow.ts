import { prisma } from '../db/prisma';

export async function getLatestProgramStart(
  sourceId: string
) {
  const latest =
    await prisma.program.findFirst({
      where: {
        sourceId
      },
      orderBy: {
        start: 'desc'
      },
      select: {
        start: true
      }
    });

  return latest?.start ?? null;
}
