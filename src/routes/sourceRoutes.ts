import { Router } from 'express';
import { prisma } from '../db/prisma';

export const sourceRoutes = Router();

sourceRoutes.get('/', async (_req, res) => {
  const sources = await prisma.source.findMany({
    orderBy: { priority: 'asc' }
  });

  res.json(sources);
});

sourceRoutes.post('/', async (req, res) => {
  const source = await prisma.source.create({
    data: req.body
  });

  res.status(201).json(source);
});

sourceRoutes.put('/:id', async (req, res) => {
  const source = await prisma.source.update({
    where: { id: req.params.id },
    data: req.body
  });

  res.json(source);
});

sourceRoutes.delete('/:id', async (req, res) => {
  await prisma.source.delete({
    where: { id: req.params.id }
  });

  res.status(204).end();
});
