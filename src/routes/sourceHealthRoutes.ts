import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireRole } from '../middleware/auth';
import { boundedLimit } from '../utils/limits';

export const sourceHealthRoutes = Router();
const requireViewer = requireRole(['admin', 'operator', 'viewer']);

sourceHealthRoutes.use(requireViewer);

sourceHealthRoutes.get('/', async (req, res) => {
  const health = await prisma.sourceHealth.findMany({
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
