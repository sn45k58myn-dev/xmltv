import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';

export const exportTokenRoutes = Router();
exportTokenRoutes.use(requireAdmin);

exportTokenRoutes.get('/', async (_req, res) => {
  const tokens = await prisma.exportToken.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.json(tokens);
});

exportTokenRoutes.post('/', async (req, res) => {
  const { name, token, profileId, providerId, active } = req.body;
  try {
    const newToken = await prisma.exportToken.create({
      data: {
        name,
        token,
        profileId,
        providerId,
        active: active ?? true
      }
    });
    res.status(201).json(newToken);
  } catch (_error) {
    res.status(400).json({ error: 'Failed to create export token' });
  }
});

exportTokenRoutes.delete('/:id', async (req, res) => {
  try {
    await prisma.exportToken.delete({
      where: { id: req.params.id }
    });
    res.status(204).end();
  } catch (_error) {
    res.status(400).json({ error: 'Failed to delete export token' });
  }
});
