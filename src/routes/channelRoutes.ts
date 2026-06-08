import { Router } from 'express';
import { prisma } from '../db/prisma';

export const channelRoutes = Router();

channelRoutes.get('/', async (_req, res) => {
  const channels = await prisma.channel.findMany({
    include: {
      aliases: true
    },
    orderBy: {
      displayName: 'asc'
    }
  });

  res.json(channels);
});

channelRoutes.get('/:id/programs', async (req, res) => {
  const programs = await prisma.program.findMany({
    where: {
      channelId: req.params.id
    },
    orderBy: {
      start: 'asc'
    },
    take: 500
  });

  res.json(programs);
});
