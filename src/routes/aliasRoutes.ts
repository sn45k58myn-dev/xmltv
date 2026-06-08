import { Router } from 'express';
import { prisma } from '../db/prisma';

export const aliasRoutes = Router();

aliasRoutes.get('/', async (_req, res) => {
  const aliases = await prisma.alias.findMany();
  res.json(aliases);
});

aliasRoutes.post('/', async (req, res) => {
  try {
    const alias = await prisma.alias.create({
      data: req.body,
    });
    res.status(201).json(alias);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create alias' });
  }
});

aliasRoutes.delete('/:id', async (req, res) => {
  try {
    await prisma.alias.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: 'Failed to delete alias' });
  }
});
