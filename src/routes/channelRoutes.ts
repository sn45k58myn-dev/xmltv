import { Router } from 'express';
import { prisma } from '../db/prisma';

export const channelRoutes = Router();

channelRoutes.get('/', async (_req, res) => {
  const channels = await prisma.channel.findMany();
  res.json(channels);
});

channelRoutes.get('/:id', async (req, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id },
  });
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  res.json(channel);
});

channelRoutes.get('/:id/programs', async (req, res) => {
  const programs = await prisma.program.findMany({
    where: { channelId: req.params.id },
  });
  res.json(programs);
});

channelRoutes.put('/:id', async (req, res) => {
  try {
    const channel = await prisma.channel.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(channel);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update channel' });
  }
});

channelRoutes.delete('/:id', async (req, res) => {
  try {
    await prisma.channel.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: 'Failed to delete channel' });
  }
});
