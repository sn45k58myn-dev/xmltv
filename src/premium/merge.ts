
import { prisma } from '../db/prisma';

export async function mergeSourcesForChannel(channelId: string) {
  const programs = await prisma.program.findMany({ where: { channelId }, include: { source: true }, orderBy: [{ start: 'asc' }, { createdAt: 'asc' }] });
  const winners = new Map<string, typeof programs[number]>();
  for (const program of programs) {
    const key = `${program.start.toISOString()}|${program.stop.toISOString()}|${program.title.toLowerCase()}`;
    const current = winners.get(key);
    if (!current || (program.source?.mergeWeight ?? 100) < (current.source?.mergeWeight ?? 100)) winners.set(key, program);
  }
  return Array.from(winners.values()).map(({ source, ...program }) => program);
}
