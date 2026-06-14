import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireRole } from '../middleware/auth';
import { boundedLimit } from '../utils/limits';
import { safeRouteId } from '../utils/routeParams';

export const sourceHealthRoutes = Router();
const requireViewer = requireRole(['admin', 'operator', 'viewer']);
const validStatuses = new Set(['success', 'failed']);

sourceHealthRoutes.use(requireViewer);

sourceHealthRoutes.get('/', async (req, res) => {
  let sourceId = '';

  try {
    sourceId = typeof req.query.sourceId === 'string'
      ? safeRouteId(req.query.sourceId.trim())
      : '';
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid source id.'
    });
  }

  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

  if (status && !validStatuses.has(status)) {
    return res.status(400).json({
      error: 'Invalid source health status.'
    });
  }

  const where = {
    ...(sourceId ? { sourceId } : {}),
    ...(status ? { status } : {})
  };

  const health = await prisma.sourceHealth.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: {
      checkedAt: 'desc'
    },
    take: boundedLimit(req.query.limit, {
      defaultValue: 100,
      max: 1000
    })
  });

  res.json(health);
});
