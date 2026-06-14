import { Router } from 'express';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { requireRole } from '../middleware/auth';
import { boundedLimit } from '../utils/limits';
import { safeRouteId } from '../utils/routeParams';

export const sourceHealthRoutes = Router();
const requireViewer = requireRole(['admin', 'operator', 'viewer']);
const validStatuses = new Set(['success', 'failed']);

sourceHealthRoutes.use(requireViewer);

sourceHealthRoutes.get('/summary', async (_req, res) => {
  const sources = await prisma.source.findMany({
    orderBy: {
      priority: 'asc'
    }
  });
  const sourceIds = sources.map((source) => source.id);
  const healthRows = sourceIds.length
    ? await prisma.sourceHealth.findMany({
      where: {
        sourceId: {
          in: sourceIds
        }
      },
      orderBy: {
        checkedAt: 'desc'
      },
      take: Math.max(sourceIds.length * 20, 100)
    })
    : [];
  const healthBySource = new Map<string, typeof healthRows>();

  for (const health of healthRows) {
    const rows = healthBySource.get(health.sourceId) ?? [];
    rows.push(health);
    healthBySource.set(
      health.sourceId,
      rows
    );
  }

  const now = new Date();

  res.json({
    generatedAt: now.toISOString(),
    sources: sources.map((source) => {
      const rows = healthBySource.get(source.id) ?? [];
      const latest = rows[0];
      const failureStreak = rows.findIndex((row) => row.status !== 'failed');
      const consecutiveFailures = latest?.status === 'failed'
        ? failureStreak === -1
          ? rows.length
          : failureStreak
        : 0;
      const backoffUntil = latest?.status === 'failed' && env.SOURCE_FAILURE_BACKOFF_MINUTES > 0
        ? new Date(latest.checkedAt.getTime() + env.SOURCE_FAILURE_BACKOFF_MINUTES * 60 * 1000)
        : null;

      return {
        sourceId: source.id,
        name: source.name,
        enabled: source.enabled,
        status: latest?.status ?? 'unknown',
        message: latest?.message ?? null,
        checkedAt: latest?.checkedAt ?? null,
        failureStreak: consecutiveFailures,
        backoffUntil,
        inBackoff: backoffUntil ? backoffUntil > now : false
      };
    })
  });
});

sourceHealthRoutes.get('/', async (req, res) => {
  let sourceId = '';

  try {
    sourceId = typeof req.query.sourceId === 'string'
      ? safeRouteId(req.query.sourceId.trim())
      : '';
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid source id.'
    });
  }

  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

  if (status && !validStatuses.has(status)) {
    return res.status(400).json({
      error: 'Invalid source health status.'
    });
  }

  const where = {
    ...(sourceId ? { sourceId } : {}),
    ...(status ? { status } : {})
  };

  const health = await prisma.sourceHealth.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: {
      checkedAt: 'desc'
    },
    take: boundedLimit(req.query.limit, {
      defaultValue: 100,
      max: 1000
    })
  });

  res.json(health);
});
