import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';
import { maskExportToken, recordAuditEvent } from '../services/auditLog';

export const exportTokenRoutes = Router();
exportTokenRoutes.use(requireAdmin);

exportTokenRoutes.get('/', async (_req, res) => {
  const tokens = await prisma.exportToken.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.json(tokens.map(maskExportToken));
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

exportTokenRoutes.delete('/:id', async (req, res) => {
  try {
    const token = await prisma.exportToken.delete({
      where: { id: req.params.id }
    });

    await recordAuditEvent(req, {
      action: 'exportToken.revoke',
      entityType: 'ExportToken',
      entityId: token.id,
      metadata: {
        name: token.name,
        profileId: token.profileId,
        providerId: token.providerId
      }
    });

    res.status(204).end();
  } catch (_error) {
    res.status(400).json({ error: 'Failed to delete export token' });
  }
});
