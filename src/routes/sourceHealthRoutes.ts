import { Router } from 'express';
import { prisma } from '../db/prisma';

export const sourceHealthRoutes = Router();

sourceHealthRoutes.get('/', async (_req, res) => {
  const health = await prisma.sourceHealth.findMany({
    orderBy: {
      checkedAt: 'desc'
    },
    take: 100
  });

  res.json(health);
});
