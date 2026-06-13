import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';

export const exportTokenRoutes = Router();
exportTokenRoutes.use(requireAdmin);

exportTokenRoutes.get('/', async (_req, res) => {
  const tokens = await prisma.exportToken.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.json(tokens.map((token) => ({
    ...token,
    token: undefined,
    tokenPreview: `${token.token.slice(0, 6)}...${token.token.slice(-4)}`
  })));
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
    res.status(201).json({
      ...newToken,
      tokenPreview: `${newToken.token.slice(0, 6)}...${newToken.token.slice(-4)}`
    });
  } catch (error) {
    res.status(400).json({ error: 'Failed to create export token' });
  }
});

exportTokenRoutes.delete('/:id', async (req, res) => {
  try {
    await prisma.exportToken.delete({
      where: { id: req.params.id }
    });
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: 'Failed to delete export token' });
  }
});
