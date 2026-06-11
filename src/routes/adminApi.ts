
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
import { getSourceCategories } from '../services/sourceCategoryService';

export const adminApi = Router();
adminApi.use(requireAdmin);

adminApi.get('/summary', async (_req, res) => {
  const [sources, channels, programs, aliases, profiles, runs, tokens] = await Promise.all([
    prisma.source.count(), prisma.channel.count(), prisma.program.count(), prisma.alias.count(), prisma.exportProfile.count(), prisma.importRun.count(), prisma.exportToken.count()
  ]);
  res.json({ sources, channels, programs, aliases, profiles, runs, tokens });
});
adminApi.get('/analytics', async (_req, res) => res.json(await getDashboardStats()));
adminApi.get('/metadata', async (_req, res) => res.json(await getFeedMetadata()));
adminApi.get('/validation', async (_req, res) => res.json(await validateCachedFeeds()));
adminApi.get('/source-categories', async (_req, res) => res.json(await getSourceCategories()));
adminApi.get('/sources', async (_req, res) => res.json(await prisma.source.findMany({ orderBy: { priority: 'asc' } })));
adminApi.post('/sources', async (req, res) => res.status(201).json(await prisma.source.create({ data: req.body })));
adminApi.patch('/sources/:id', async (req, res) => res.json(await prisma.source.update({ where: { id: req.params.id }, data: req.body })));
adminApi.get('/imports', async (_req, res) => res.json(await prisma.importRun.findMany({ include: { source: true }, orderBy: { startedAt: 'desc' }, take: 100 })));
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
  const statsByChannel = new Map(
    programStats.map((row) => [row.channelId, row])
  );

  res.json(channels.map((channel) => {
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
adminApi.patch('/channels/:id', async (req, res) => res.json(await prisma.channel.update({ where: { id: req.params.id }, data: req.body })));
adminApi.post('/channels/merge', async (req, res) => res.json(await mergeChannels(req.body.targetChannelId, req.body.channelIdsToMerge)));
adminApi.post('/aliases/generate', async (req, res) => res.json(await autoGenerateAliases(req.body.channelId)));
adminApi.post('/aliases', async (req, res) => res.status(201).json(await prisma.alias.create({ data: req.body })));
adminApi.delete('/aliases/:id', async (req, res) => res.json(await prisma.alias.delete({ where: { id: req.params.id } })));
adminApi.get('/profiles', async (_req, res) => res.json(await prisma.exportProfile.findMany({ orderBy: { name: 'asc' } })));
adminApi.post('/profiles', async (req, res) => res.status(201).json(await prisma.exportProfile.create({ data: req.body })));
adminApi.patch('/profiles/:id', async (req, res) => res.json(await prisma.exportProfile.update({ where: { id: req.params.id }, data: req.body })));
adminApi.get('/tokens', async (_req, res) => res.json(await prisma.exportToken.findMany({ orderBy: { createdAt: 'desc' } })));
adminApi.post('/tokens', async (req, res) => res.status(201).json(await prisma.exportToken.create({ data: { name: req.body.name ?? 'Export token', profileId: req.body.profileId, providerId: req.body.providerId, token: crypto.randomBytes(24).toString('hex') } })));
adminApi.post('/enrich/tmdb/:programId', async (req, res) => res.json(await enrichProgramWithTmdb(req.params.programId)));
adminApi.post('/enrich/channel/:channelId/assets', async (req, res) => res.json(await enrichChannelAssets(req.params.channelId, req.body.logo, req.body.image)));
adminApi.post('/catchup/:programId', async (req, res) => res.json(await attachCatchupMetadata(req.params.programId, req.body.catchupUrl, req.body.catchupDays)));
