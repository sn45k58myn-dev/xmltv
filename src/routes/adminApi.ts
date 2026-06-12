
import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';
import { autoGenerateAliases } from '../premium/aliasGenerator';
import { attachCatchupMetadata, enrichChannelAssets, enrichProgramWithTmdb } from '../premium/enrichment';
import { mergeChannels } from '../premium/mergeEngine';
import { getDashboardStats } from '../services/dashboardService';
import { getFeedMetadata } from '../services/feedMetadata';
import { validateCachedFeeds } from '../services/feedValidation';
import { getFeedQuality } from '../services/feedQuality';
import { getSourceCategories } from '../services/sourceCategoryService';
import { getAuditEvents, maskExportToken, recordAuditEvent } from '../services/auditLog';

export const adminApi = Router();
adminApi.use(requireAdmin);

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

adminApi.get('/summary', async (_req, res) => {
  const [sources, channels, programs, aliases, profiles, runs, tokens] = await Promise.all([
    prisma.source.count(), prisma.channel.count(), prisma.program.count(), prisma.alias.count(), prisma.exportProfile.count(), prisma.importRun.count(), prisma.exportToken.count()
  ]);
  res.json({ sources, channels, programs, aliases, profiles, runs, tokens });
});
adminApi.get('/analytics', async (_req, res) => res.json(await getDashboardStats()));
adminApi.get('/metadata', async (_req, res) => res.json(await getFeedMetadata()));
adminApi.get('/validation', async (_req, res) => res.json(await validateCachedFeeds()));
adminApi.get('/quality', async (_req, res) => res.json(await getFeedQuality()));
adminApi.get('/source-categories', async (_req, res) => res.json(await getSourceCategories()));
adminApi.get('/sources', async (_req, res) => res.json(await prisma.source.findMany({ orderBy: { priority: 'asc' } })));
adminApi.post('/sources', async (req, res) => {
  const source = await prisma.source.create({ data: req.body });

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
adminApi.patch('/sources/:id', async (req, res) => {
  const source = await prisma.source.update({ where: { id: req.params.id }, data: req.body });

  await recordAuditEvent(req, {
    action: 'source.update',
    entityType: 'Source',
    entityId: source.id,
    metadata: req.body
  });

  res.json(source);
});
adminApi.get('/imports', async (_req, res) => res.json(await prisma.importRun.findMany({ include: { source: true }, orderBy: { startedAt: 'desc' }, take: 100 })));
adminApi.get('/jobs', async (_req, res) => res.json(await prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 })));
adminApi.get('/audit', async (req, res) => {
  const limit = Number(req.query.limit ?? 100);

  res.json(await getAuditEvents(Number.isFinite(limit) ? limit : 100));
});
adminApi.get('/jobs/:id', async (req, res) => {
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
adminApi.get('/coverage', async (_req, res) => {
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
adminApi.get('/channels', async (_req, res) => res.json(await prisma.channel.findMany({ include: { aliases: true, mappings: true }, orderBy: { displayName: 'asc' }, take: 500 })));
adminApi.patch('/channels/:id', async (req, res) => {
  const channel = await prisma.channel.update({ where: { id: req.params.id }, data: req.body });

  await recordAuditEvent(req, {
    action: 'channel.update',
    entityType: 'Channel',
    entityId: channel.id,
    metadata: req.body
  });

  res.json(channel);
});
adminApi.post('/channels/merge', async (req, res) => {
  const result = await mergeChannels(req.body.targetChannelId, req.body.channelIdsToMerge);

  await recordAuditEvent(req, {
    action: 'channel.merge',
    entityType: 'Channel',
    entityId: req.body.targetChannelId,
    metadata: {
      channelIdsToMerge: req.body.channelIdsToMerge
    }
  });

  res.json(result);
});
adminApi.post('/aliases/generate', async (req, res) => res.json(await autoGenerateAliases(req.body.channelId)));
adminApi.post('/aliases', async (req, res) => {
  const alias = await prisma.alias.create({ data: req.body });

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
adminApi.delete('/aliases/:id', async (req, res) => {
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
adminApi.get('/profiles', async (_req, res) => res.json(await prisma.exportProfile.findMany({ orderBy: { name: 'asc' } })));
adminApi.post('/profiles', async (req, res) => {
  const profile = await prisma.exportProfile.create({ data: req.body });

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
adminApi.patch('/profiles/:id', async (req, res) => {
  const profile = await prisma.exportProfile.update({ where: { id: req.params.id }, data: req.body });

  await recordAuditEvent(req, {
    action: 'profile.update',
    entityType: 'ExportProfile',
    entityId: profile.id,
    metadata: req.body
  });

  res.json(profile);
});
adminApi.get('/tokens', async (_req, res) => {
  const tokens = await prisma.exportToken.findMany({ orderBy: { createdAt: 'desc' } });

  res.json(tokens.map(maskExportToken));
});
adminApi.post('/tokens', async (req, res) => {
  const token = await prisma.exportToken.create({ data: { name: req.body.name ?? 'Export token', profileId: req.body.profileId, providerId: req.body.providerId, token: crypto.randomBytes(24).toString('hex') } });

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
adminApi.post('/enrich/tmdb/:programId', async (req, res) => res.json(await enrichProgramWithTmdb(req.params.programId)));
adminApi.post('/enrich/channel/:channelId/assets', async (req, res) => res.json(await enrichChannelAssets(req.params.channelId, req.body.logo, req.body.image)));
adminApi.post('/catchup/:programId', async (req, res) => res.json(await attachCatchupMetadata(req.params.programId, req.body.catchupUrl, req.body.catchupDays)));
