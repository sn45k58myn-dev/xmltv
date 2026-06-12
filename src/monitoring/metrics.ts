
import { prisma } from '../db/prisma';
import { getRequestMetrics } from './requestMetrics';

export async function systemMetrics() {
  const [latestRun, failedRuns, channels, programs] = await Promise.all([
    prisma.importRun.findFirst({ include: { source: true }, orderBy: { startedAt: 'desc' } }),
    prisma.importRun.count({ where: { status: 'failed' } }),
    prisma.channel.count(),
    prisma.program.count()
  ]);

  return {
    ok: true,
    latestRun,
    failedRuns,
    channels,
    programs,
    uptimeSeconds: process.uptime(),
    memory: process.memoryUsage(),
    requests: getRequestMetrics()
  };
}
