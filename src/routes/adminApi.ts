
import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../db/prisma';
import { requireAdmin, requireOperator, requireRole } from '../middleware/auth';
import { autoGenerateAliases } from '../premium/aliasGenerator';
import { attachCatchupMetadata, enrichChannelAssets, enrichProgramWithTmdb } from '../premium/enrichment';
import { mergeChannels } from '../premium/mergeEngine';
import { getDashboardStats } from '../services/dashboardService';
import { getFeedMetadata } from '../services/feedMetadata';
import { validateCachedFeeds } from '../services/feedValidation';
import { getFeedQuality, getFeedQualityHistory } from '../services/feedQuality';
import { getSourceCategories } from '../services/sourceCategoryService';
import { getAuditEvents, maskExportToken, recordAuditEvent } from '../services/auditLog';
import { createApiKey, maskApiKey } from '../services/apiKeys';
import {
  aliasCreateSchema,
  aliasGenerateSchema,
  catchupSchema,
  channelAssetsSchema,
  channelMergeSchema,
  channelUpdateSchema,
  exportTokenCreateSchema,
  parseAdminPayload,
  parseApiKeyCreatePayload,
  parseProfileCreatePayload,
  parseSourceCreatePayload,
  profileUpdateSchema,
  sourceUpdateSchema
} from '../utils/adminPayloads';

export const adminApi = Router();
const requireViewer = requireRole(['admin', 'operator', 'viewer']);

type CoverageChannelRow = {
  id: string;
  displayName: string;
  country: string | null;
  category: string | null;
};

type CoverageProgramGroupRow = {
  channelId: string;
  _count: {
    _all: number;
  };
  _min: {
    start: Date | null;
  };
  _max: {
    stop: Date | null;
  };
};

adminApi.get('/summary', requireViewer, async (_req, res) => {
  const [sources, channels, programs, aliases, profiles, runs, tokens] = await Promise.all([
    prisma.source.count(), prisma.channel.count(), prisma.program.count(), prisma.alias.count(), prisma.exportProfile.count(), prisma.importRun.count(), prisma.exportToken.count()
  ]);
  res.json({ sources, channels, programs, aliases, profiles, runs, tokens });
});
adminApi.get('/analytics', requireViewer, async (_req, res) => res.json(await getDashboardStats()));
adminApi.get('/metadata', requireViewer, async (_req, res) => res.json(await getFeedMetadata()));
adminApi.get('/validation', requireOperator, async (_req, res) => res.json(await validateCachedFeeds()));
adminApi.get('/quality', requireViewer, async (req, res) => {
  const persistSnapshot = req.query.snapshot === 'true';

  if (persistSnapshot && req.auth?.role === 'viewer') {
    return res.status(403).json({
      error: 'API key role is not allowed to persist feed quality snapshots.'
    });
  }

  return res.json(await getFeedQuality({
    persistSnapshot
  }));
});
adminApi.get('/quality/history', requireViewer, async (req, res) => {
  const limit = Number(req.query.limit ?? 100);

  res.json(await getFeedQualityHistory(Number.isFinite(limit) ? limit : 100));
});
adminApi.get('/source-categories', requireViewer, async (_req, res) => res.json(await getSourceCategories()));
adminApi.get('/sources', requireViewer, async (_req, res) => res.json(await prisma.source.findMany({ orderBy: { priority: 'asc' } })));
adminApi.post('/sources', requireAdmin, async (req, res) => {
  const data = parseSourceCreatePayload(req.body);
  const source = await prisma.source.create({ data });

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
adminApi.patch('/sources/:id', requireAdmin, async (req, res) => {
  const data = parseAdminPayload(sourceUpdateSchema, req.body);
  const source = await prisma.source.update({ where: { id: req.params.id }, data });

  await recordAuditEvent(req, {
    action: 'source.update',
    entityType: 'Source',
    entityId: source.id,
    metadata: data
  });

  res.json(source);
});
adminApi.get('/imports', requireViewer, async (_req, res) => res.json(await prisma.importRun.findMany({ include: { source: true }, orderBy: { startedAt: 'desc' }, take: 100 })));
adminApi.get('/jobs', requireViewer, async (_req, res) => res.json(await prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 })));
adminApi.get('/queue', requireViewer, async (_req, res) => res.json(await prisma.jobQueue.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })));
adminApi.get('/audit', requireAdmin, async (req, res) => {
  const limit = Number(req.query.limit ?? 100);

  res.json(await getAuditEvents(Number.isFinite(limit) ? limit : 100));
});
adminApi.get('/api-keys', requireAdmin, async (_req, res) => {
  const apiKeys = await prisma.apiKey.findMany({
    orderBy: {
      createdAt: 'desc'
    }
  });

  res.json(apiKeys.map(maskApiKey));
});
adminApi.post('/api-keys', requireAdmin, async (req, res) => {
  const data = parseApiKeyCreatePayload(req.body);
  const {
    key,
    apiKey
  } = await createApiKey(data);

  await recordAuditEvent(req, {
    action: 'apiKey.create',
    entityType: 'ApiKey',
    entityId: apiKey.id,
    metadata: {
      name: apiKey.name,
      role: apiKey.role,
      prefix: apiKey.prefix
    }
  });

  res.status(201).json({
    ...maskApiKey(apiKey),
    key
  });
});
adminApi.delete('/api-keys/:id', requireAdmin, async (req, res) => {
  const apiKey = await prisma.apiKey.update({
    where: {
      id: req.params.id
    },
    data: {
      active: false
    }
  });

  await recordAuditEvent(req, {
    action: 'apiKey.revoke',
    entityType: 'ApiKey',
    entityId: apiKey.id,
    metadata: {
      name: apiKey.name,
      role: apiKey.role,
      prefix: apiKey.prefix
    }
  });

  res.status(204).end();
});
adminApi.get('/jobs/:id', requireViewer, async (req, res) => {
  const job = await prisma.jobRun.findUnique({
    where: {
      id: req.params.id
    }
  });

  if (!job) {
    return res.status(404).json({
      error: 'Job run not found'
    });
  }

  return res.json(job);
});
adminApi.get('/coverage', requireViewer, async (_req, res) => {
  const [
    channels,
    programStats
  ] = await Promise.all([
    prisma.channel.findMany({
      orderBy: {
        displayName: 'asc'
      },
      select: {
        id: true,
        displayName: true,
        country: true,
        category: true
      },
      take: 1000
    }),
    prisma.program.groupBy({
      by: ['channelId'],
      _count: {
        _all: true
      },
      _min: {
        start: true
      },
      _max: {
        stop: true
      }
    })
  ]);
  const typedChannels: CoverageChannelRow[] = channels;
  const typedProgramStats: CoverageProgramGroupRow[] = programStats;
  const statsByChannel = new Map(
    typedProgramStats.map((row) => [row.channelId, row])
  );

  res.json(typedChannels.map((channel) => {
    const stats = statsByChannel.get(channel.id);

    return {
      id: channel.id,
      name: channel.displayName,
      country: channel.country,
      category: channel.category,
      programs: stats?._count._all ?? 0,
      first: stats?._min.start,
      last: stats?._max.stop
    };
  }));
});
adminApi.get('/channels', requireViewer, async (_req, res) => res.json(await prisma.channel.findMany({ include: { aliases: true, mappings: true }, orderBy: { displayName: 'asc' }, take: 500 })));
adminApi.patch('/channels/:id', requireAdmin, async (req, res) => {
  const data = parseAdminPayload(channelUpdateSchema, req.body);
  const channel = await prisma.channel.update({ where: { id: req.params.id }, data });

  await recordAuditEvent(req, {
    action: 'channel.update',
    entityType: 'Channel',
    entityId: channel.id,
    metadata: data
  });

  res.json(channel);
});
adminApi.post('/channels/merge', requireAdmin, async (req, res) => {
  const data = parseAdminPayload(channelMergeSchema, req.body);
  const result = await mergeChannels(data.targetChannelId, data.channelIdsToMerge);

  await recordAuditEvent(req, {
    action: 'channel.merge',
    entityType: 'Channel',
    entityId: data.targetChannelId,
    metadata: {
      channelIdsToMerge: data.channelIdsToMerge
    }
  });

  res.json(result);
});
adminApi.post('/aliases/generate', requireAdmin, async (req, res) => {
  const data = parseAdminPayload(aliasGenerateSchema, req.body);

  res.json(await autoGenerateAliases(data.channelId));
});
adminApi.post('/aliases', requireAdmin, async (req, res) => {
  const data = parseAdminPayload(aliasCreateSchema, req.body);
  const alias = await prisma.alias.create({
    data: {
      value: data.value,
      normalized: data.normalized,
      channel: {
        connect: {
          id: data.channelId
        }
      }
    }
  });

  await recordAuditEvent(req, {
    action: 'channel.alias.create',
    entityType: 'Alias',
    entityId: alias.id,
    metadata: {
      channelId: alias.channelId
    }
  });

  res.status(201).json(alias);
});
adminApi.delete('/aliases/:id', requireAdmin, async (req, res) => {
  const alias = await prisma.alias.delete({ where: { id: req.params.id } });

  await recordAuditEvent(req, {
    action: 'channel.alias.delete',
    entityType: 'Alias',
    entityId: alias.id,
    metadata: {
      channelId: alias.channelId
    }
  });

  res.json(alias);
});
adminApi.get('/profiles', requireViewer, async (_req, res) => res.json(await prisma.exportProfile.findMany({ orderBy: { name: 'asc' } })));
adminApi.post('/profiles', requireAdmin, async (req, res) => {
  const data = parseProfileCreatePayload(req.body);
  const profile = await prisma.exportProfile.create({ data });

  await recordAuditEvent(req, {
    action: 'profile.create',
    entityType: 'ExportProfile',
    entityId: profile.id,
    metadata: {
      name: profile.name,
      slug: profile.slug
    }
  });

  res.status(201).json(profile);
});
adminApi.patch('/profiles/:id', requireAdmin, async (req, res) => {
  const data = parseAdminPayload(profileUpdateSchema, req.body);
  const profile = await prisma.exportProfile.update({ where: { id: req.params.id }, data });

  await recordAuditEvent(req, {
    action: 'profile.update',
    entityType: 'ExportProfile',
    entityId: profile.id,
    metadata: data
  });

  res.json(profile);
});
adminApi.get('/tokens', requireAdmin, async (_req, res) => {
  const tokens = await prisma.exportToken.findMany({ orderBy: { createdAt: 'desc' } });

  res.json(tokens.map(maskExportToken));
});
adminApi.post('/tokens', requireAdmin, async (req, res) => {
  const data = parseAdminPayload(exportTokenCreateSchema, req.body);
  const token = await prisma.exportToken.create({
    data: {
      name: data.name ?? 'Export token',
      profileId: data.profileId,
      providerId: data.providerId,
      active: data.active ?? true,
      token: crypto.randomBytes(24).toString('hex')
    }
  });

  await recordAuditEvent(req, {
    action: 'exportToken.create',
    entityType: 'ExportToken',
    entityId: token.id,
    metadata: {
      name: token.name,
      profileId: token.profileId,
      providerId: token.providerId
    }
  });

  res.status(201).json(maskExportToken(token));
});
adminApi.post('/enrich/tmdb/:programId', requireAdmin, async (req, res) => res.json(await enrichProgramWithTmdb(req.params.programId)));
adminApi.post('/enrich/channel/:channelId/assets', requireAdmin, async (req, res) => {
  const data = parseAdminPayload(channelAssetsSchema, req.body);

  res.json(await enrichChannelAssets(req.params.channelId, data.logo, data.image));
});
adminApi.post('/catchup/:programId', requireAdmin, async (req, res) => {
  const data = parseAdminPayload(catchupSchema, req.body);

  res.json(await attachCatchupMetadata(req.params.programId, data.catchupUrl, data.catchupDays));
});
