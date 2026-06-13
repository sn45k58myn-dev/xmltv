import { Router } from 'express';
import { prisma } from '../db/prisma';
import { getFeedDownloads } from '../services/downloadMetrics';
import { getFeedSizes } from '../services/feedMetrics';
import { getDashboardStats } from '../services/dashboardService';
import { requireRole } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import { boundedLimit } from '../utils/limits';

export const statsRoutes = Router();
const requireViewer = requireRole(['admin', 'operator', 'viewer']);

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

statsRoutes.get('/top-feeds', noStore, requireViewer, async (_req, res) => {
  const downloads =
    await getFeedDownloads(20);

  res.json(
    downloads
  );
});

statsRoutes.get('/feeds', noStore, requireViewer, async (_req, res) => {
  res.json(
    await getFeedSizes()
  );
});

statsRoutes.get('/imports', noStore, requireViewer, async (req, res) => {
  const runs =
    await prisma.importRun.findMany({
      orderBy: {
        startedAt: 'desc'
      },
      take: boundedLimit(req.query.limit, {
        defaultValue: 50,
        max: 500
      })
    });

  res.json(runs);
});

statsRoutes.get('/downloads', noStore, requireViewer, async (req, res) => {
  res.json(
    await getFeedDownloads(Number(req.query.limit))
  );
});
