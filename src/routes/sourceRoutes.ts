import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';
import { parseAdminPayload, parseSourceCreatePayload, sourceUpdateSchema } from '../utils/adminPayloads';

export const sourceRoutes = Router();
sourceRoutes.use(requireAdmin);

sourceRoutes.get('/', async (_req, res) => {
  const sources = await prisma.source.findMany({
    orderBy: { priority: 'asc' }
  });

  res.json(sources);
});

sourceRoutes.post('/', async (req, res) => {
  const data = parseSourceCreatePayload(req.body);
  const source = await prisma.source.create({
    data
  });

  res.status(201).json(source);
});

sourceRoutes.put('/:id', async (req, res) => {
  const data = parseAdminPayload(sourceUpdateSchema, req.body);
  const source = await prisma.source.update({
    where: { id: req.params.id },
    data
  });

  res.json(source);
});

sourceRoutes.delete('/:id', async (req, res) => {
  await prisma.source.delete({
    where: { id: req.params.id }
  });

  res.status(204).end();
});
