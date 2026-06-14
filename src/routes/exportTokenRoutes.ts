import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';
import { maskExportToken, recordAuditEvent } from '../services/auditLog';
import {
  exportTokenUpdateSchema,
  legacyExportTokenCreateSchema,
  parseAdminPayload,
  parseNonEmptyAdminPayload
} from '../utils/adminPayloads';
import { boundedLimit } from '../utils/limits';
import { safeRouteId } from '../utils/routeParams';

export const exportTokenRoutes = Router();
exportTokenRoutes.use(requireAdmin);

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

exportTokenRoutes.get('/', async (req, res) => {
  const tokens = await prisma.exportToken.findMany({
    orderBy: { createdAt: 'desc' },
    take: boundedLimit(req.query.limit, {
      defaultValue: 100,
      max: 500
    })
  });
  res.json(tokens.map(maskExportToken));
});

exportTokenRoutes.post('/', async (req, res) => {
  const data = parseAdminPayload(legacyExportTokenCreateSchema, req.body);

  try {
    const newToken = await prisma.exportToken.create({
      data: {
        name: data.name ?? 'Export token',
        token: data.token,
        profileId: data.profileId,
        providerId: data.providerId,
        active: data.active ?? true
      }
    });
    await recordAuditEvent(req, {
      action: 'exportToken.create',
      entityType: 'ExportToken',
      entityId: newToken.id,
      metadata: {
        name: newToken.name,
        profileId: newToken.profileId,
        providerId: newToken.providerId
      }
    });

    res.status(201).json(maskExportToken(newToken));
  } catch (_error) {
    res.status(400).json({ error: 'Failed to create export token' });
  }
});

exportTokenRoutes.patch('/:id', async (req, res) => {
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const data = parseNonEmptyAdminPayload(exportTokenUpdateSchema, req.body);

  try {
    const token = await prisma.exportToken.update({
      where: { id },
      data
    });

    await recordAuditEvent(req, {
      action: 'exportToken.update',
      entityType: 'ExportToken',
      entityId: token.id,
      metadata: {
        changedFields: Object.keys(data),
        name: token.name,
        profileId: token.profileId,
        providerId: token.providerId,
        active: token.active
      }
    });

    res.json(maskExportToken(token));
  } catch (_error) {
    res.status(400).json({ error: 'Failed to update export token' });
  }
});

exportTokenRoutes.delete('/:id', async (req, res) => {
  const id = routeIdParam(req.params.id, res);
  if (!id) return;

  try {
    const token = await prisma.exportToken.update({
      where: { id },
      data: {
        active: false
      }
    });

    await recordAuditEvent(req, {
      action: 'exportToken.revoke',
      entityType: 'ExportToken',
      entityId: token.id,
      metadata: {
        name: token.name,
        profileId: token.profileId,
        providerId: token.providerId,
        requests: token.requests
      }
    });

    res.status(204).end();
  } catch (_error) {
    res.status(400).json({ error: 'Failed to deactivate export token' });
  }
});
