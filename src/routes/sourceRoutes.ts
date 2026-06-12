import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';
import { recordAuditEvent } from '../services/auditLog';

export const sourceRoutes = Router();
sourceRoutes.use(requireAdmin);

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

  await recordAuditEvent(req, {
    action: 'source.create',
    entityType: 'Source',
    entityId: source.id,
    metadata: {
      name: source.name,
      type: source.type
    }
  });

  res.status(201).json(source);
});

sourceRoutes.put('/:id', async (req, res) => {
  const source = await prisma.source.update({
    where: { id: req.params.id },
    data: req.body
  });

  await recordAuditEvent(req, {
    action: 'source.update',
    entityType: 'Source',
    entityId: source.id,
    metadata: req.body
  });

  res.json(source);
});

sourceRoutes.delete('/:id', async (req, res) => {
  const source = await prisma.source.delete({
    where: { id: req.params.id }
  });

  await recordAuditEvent(req, {
    action: 'source.delete',
    entityType: 'Source',
    entityId: source.id,
    metadata: {
      name: source.name,
      type: source.type
    }
  });

  res.status(204).end();
});
