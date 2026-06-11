import { Router } from 'express';
import { prisma } from '../db/prisma';
import { getFeedDownloads } from '../services/downloadMetrics';
import { getFeedSizes } from '../services/feedMetrics';
import { getDashboardStats } from '../services/dashboardService';

export const statsRoutes = Router();

statsRoutes.get('/', async (_req, res) => {
  const [
    channels,
    programs,
    aliases,
    sources,
    lastImport
  ] = await Promise.all([
    prisma.channel.count(),
    prisma.program.count(),
    prisma.alias.count(),
    prisma.source.count(),
    prisma.importRun.findFirst({
      orderBy: {
        startedAt: 'desc'
      }
    })
  ]);

  res.json({
    channels,
    programs,
    aliases,
    sources,
    lastImport
  });
});

statsRoutes.get('/dashboard', async (_req, res) => {
  res.json(
    await getDashboardStats()
  );
});

statsRoutes.get('/top-feeds', async (_req, res) => {
  const downloads =
    await getFeedDownloads();

  res.json(
    downloads.slice(0, 20)
  );
});

statsRoutes.get('/feeds', async (_req, res) => {
  res.json(
    await getFeedSizes()
  );
});

statsRoutes.get('/imports', async (_req, res) => {
  const runs =
    await prisma.importRun.findMany({
      orderBy: {
        startedAt: 'desc'
      },
      take: 50
    });

  res.json(runs);
});

statsRoutes.get('/downloads', async (_req, res) => {
  res.json(
    await getFeedDownloads()
  );
});
