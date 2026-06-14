import { Router } from 'express';
import { prisma } from '../db/prisma';
import { boundedLimit } from '../utils/limits';

export const channelRoutes = Router();

channelRoutes.get('/', async (req, res) => {
  const channels = await prisma.channel.findMany({
    include: {
      aliases: true
    },
    orderBy: {
      displayName: 'asc'
    },
    take: boundedLimit(req.query.limit, {
      defaultValue: 500,
      max: 5000
    })
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
    take: boundedLimit(req.query.limit, {
      defaultValue: 500,
      max: 5000
    })
  });

  res.json(programs);
});
