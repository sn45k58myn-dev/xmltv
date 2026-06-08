import { Router } from 'express';
import { prisma } from '../db/prisma';

export const importRoutes = Router();

importRoutes.get('/', async (_req, res) => {
  const imports = await prisma.importRun.findMany({
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      channelsSeen: true,
      programsSeen: true,
      errors: true,
    },
    orderBy: {
      startedAt: 'desc',
    },
  });
  res.json(imports);
});
