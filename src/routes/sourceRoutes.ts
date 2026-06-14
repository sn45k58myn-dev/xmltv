import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';
import { recordAuditEvent } from '../services/auditLog';
import { parseNonEmptyAdminPayload, parseSourceCreatePayload, sourceUpdateSchema } from '../utils/adminPayloads';
import { boundedLimit } from '../utils/limits';
import { safeRouteId } from '../utils/routeParams';

export const sourceRoutes = Router();
sourceRoutes.use(requireAdmin);

function routeIdParam(
  value: string,
  res
) {
  try {
    return safeRouteId(value);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid route id.'
    });
    return undefined;
  }
}

sourceRoutes.get('/', async (req, res) => {
  const sources = await prisma.source.findMany({
    orderBy: { priority: 'asc' },
    take: boundedLimit(req.query.limit, {
      defaultValue: 500,
      max: 5000
    })
  });

  res.json(sources);
});

sourceRoutes.post('/', async (req, res) => {
  const data = parseSourceCreatePayload(req.body);
  const source = await prisma.source.create({
    data
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
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const data = parseNonEmptyAdminPayload(
    sourceUpdateSchema,
    req.body
  );
  const source = await prisma.source.update({
    where: { id },
    data
  });

  await recordAuditEvent(req, {
    action: 'source.update',
    entityType: 'Source',
    entityId: source.id,
    metadata: data
  });

  res.json(source);
});

sourceRoutes.delete('/:id', async (req, res) => {
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const source = await prisma.source.update({
    where: { id },
    data: {
      enabled: false
    }
  });

  await recordAuditEvent(req, {
    action: 'source.disable',
    entityType: 'Source',
    entityId: source.id,
    metadata: {
      name: source.name,
      type: source.type,
      reason: 'delete route requested'
    }
  });

  res.status(204).end();
});
