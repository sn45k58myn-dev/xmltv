
import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env';
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
import { clearAuditEvents, getAuditEvents, maskExportToken, recordAuditEvent } from '../services/auditLog';
import { createApiKey, maskApiKey } from '../services/apiKeys';
import { enqueueJob, getQueueHealth, requeueStaleRunningJobs, retryFailedQueuedJob } from '../jobs/jobQueue';
import { enqueueBullJob } from '../jobs/bullQueue';
import { runTrackedJob } from '../jobs/jobRuns';
import { getWebGrabStatus, runWebGrabImport, summarizeWebGrabResult } from '../services/webgrabRunner';
import { boundedLimit } from '../utils/limits';
import { safeRouteId } from '../utils/routeParams';
import {
  aliasCreateSchema,
  aliasGenerateSchema,
  apiKeyUpdateSchema,
  catchupSchema,
  channelAssetsSchema,
  channelMergeSchema,
  channelUpdateSchema,
  exportTokenCreateSchema,
  parseAdminPayload,
  parseApiKeyCreatePayload,
  parseNonEmptyAdminPayload,
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

function isRecoverableWebGrabError(message: string) {
  const lower = message.toLowerCase();

  return lower.includes('webgrab+plus importer is disabled')
    || lower.includes('webgrab+plus command failed')
    || lower.includes('webgrab+plus output')
    || lower.includes('webgrab+plus xmltv import failed')
    || lower.includes('webgrab_command')
    || lower.includes('command is required')
    || lower.includes('not a file')
    || lower.includes('output is empty')
    || lower.includes('exceeds')
    || lower.includes('spawn')
    || lower.includes('enoent')
    || lower.includes('no such file')
    || lower.includes('permission denied')
    || lower.includes('timed out')
    || lower.includes('command timed');
}

adminApi.get('/summary', requireViewer, async (_req, res) => {
  const [sources, channels, programs, aliases, profiles, runs, tokens] = await Promise.all([
    prisma.source.count(), prisma.channel.count(), prisma.program.count(), prisma.alias.count(), prisma.exportProfile.count(), prisma.importRun.count(), prisma.exportToken.count()
  ]);
  res.json({ sources, channels, programs, aliases, profiles, runs, tokens });
});
adminApi.get('/analytics', requireViewer, async (_req, res) => res.json(await getDashboardStats()));
adminApi.get('/metadata', requireViewer, async (_req, res) => res.json(await getFeedMetadata()));
adminApi.get('/validation', requireOperator, async (_req, res) => res.json(await validateCachedFeeds()));
adminApi.get('/webgrab/status', requireViewer, async (_req, res) => res.json(await getWebGrabStatus()));
adminApi.post('/webgrab/run', requireAdmin, async (req, res) => {
  try {
    const status = await getWebGrabStatus();

    if (!status.enabled) {
      return res.status(400).json({
        error: 'WebGrab+Plus importer is disabled. Set WEBGRAB_ENABLED=true to enable it.'
      });
    }

    if (!status.commandConfigured) {
      return res.status(400).json({
        error: 'WEBGRAB_COMMAND is required when WEBGRAB_ENABLED=true.',
        status
      });
    }

    if (env.IMPORT_RUN_MODE === 'queue') {
    if (env.JOB_QUEUE_BACKEND === 'bullmq') {
      const job = await enqueueBullJob('webgrab-run', {
        actor: req.auth?.actor ?? null,
        requestId: req.requestId ?? null
      });

        await recordAuditEvent(req, {
          action: 'webgrab.queue',
          entityType: 'BullMQ',
          entityId: job.id,
          metadata: {
            backend: 'bullmq'
          }
        });

        return res.status(202).json({
          queued: true,
          backend: 'bullmq',
          jobId: job.id,
          status: job.status,
          type: job.type
        });
      }

      const job = await enqueueJob('webgrab-run', {
        actor: req.auth?.actor ?? null,
        requestId: req.requestId ?? null
      });

      await recordAuditEvent(req, {
        action: 'webgrab.queue',
        entityType: 'JobQueue',
        entityId: job.id,
        metadata: {
          backend: 'database'
        }
      });

      return res.status(202).json({
        queued: true,
        backend: 'database',
        jobId: job.id,
        status: job.status,
        type: job.type
      });
    }

    const result = await runTrackedJob(
      'webgrab-run',
      'manual',
      runWebGrabImport,
      summarizeWebGrabResult,
      {
        actor: req.auth?.actor ?? null,
        requestId: req.requestId ?? null
      }
    );

    await recordAuditEvent(req, {
      action: 'webgrab.run',
      entityType: 'ImportRun',
      entityId: (result.importResult as { id?: string })?.id,
      metadata: {
        sourceName: result.sourceName,
        channels: result.channels,
        programs: result.programs,
        feedsRebuilt: result.feedsRebuilt
      }
    });

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Unknown WebGrab+Plus run error';

    return res.status(isRecoverableWebGrabError(message) ? 400 : 500).json({
      error: message
    });
  }
});
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
  res.json(await getFeedQualityHistory(boundedLimit(req.query.limit, {
    defaultValue: 100,
    max: 1000
  })));
});
adminApi.get('/source-categories', requireViewer, async (_req, res) => res.json(await getSourceCategories()));
adminApi.get('/sources', requireViewer, async (req, res) => res.json(await prisma.source.findMany({
  orderBy: { priority: 'asc' },
  take: boundedLimit(req.query.limit, {
    defaultValue: 500,
    max: 5000
  })
})));
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
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const data = parseNonEmptyAdminPayload(sourceUpdateSchema, req.body);
  const source = await prisma.source.update({ where: { id }, data });

  await recordAuditEvent(req, {
    action: 'source.update',
    entityType: 'Source',
    entityId: source.id,
    metadata: data
  });

  res.json(source);
});
adminApi.get('/imports', requireViewer, async (req, res) => res.json(await prisma.importRun.findMany({
  include: { source: true },
  orderBy: { startedAt: 'desc' },
  take: boundedLimit(req.query.limit, {
    defaultValue: 100,
    max: 500
  })
})));
adminApi.get('/jobs', requireViewer, async (req, res) => res.json(await prisma.jobRun.findMany({
  orderBy: { startedAt: 'desc' },
  take: boundedLimit(req.query.limit, {
    defaultValue: 100,
    max: 500
  })
})));
adminApi.get('/queue', requireViewer, async (req, res) => res.json(await prisma.jobQueue.findMany({
  orderBy: { createdAt: 'desc' },
  take: boundedLimit(req.query.limit, {
    defaultValue: 100,
    max: 500
  })
})));
adminApi.delete('/queue', requireAdmin, async (req, res) => {
  const statusParam = String(req.query.status || '');
  const statuses = statusParam.length
    ? statusParam
        .split(',')
        .map((status) => status.trim())
        .filter(Boolean)
    : ['failed', 'completed'];

  if (statuses.length === 0) {
    res.status(400).json({ error: 'Provide at least one status value, e.g. ?status=failed,completed' });
    return;
  }

  const allowedStatuses = new Set(['failed', 'completed', 'running', 'pending', 'stale', 'cancelled']);
  const invalid = statuses.find((status) => !allowedStatuses.has(status));

  if (invalid) {
    res.status(400).json({ error: `Unsupported status value: ${invalid}` });
    return;
  }

  const maxAgeHoursRaw = req.query.maxAgeHours;
  const maxAgeHours = maxAgeHoursRaw ? Number(maxAgeHoursRaw) : null;

  if (maxAgeHoursRaw && (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0)) {
    res.status(400).json({
      error: 'If provided, maxAgeHours must be a positive number.'
    });
    return;
  }

  const minimumDate = maxAgeHours
    ? new Date(Date.now() - maxAgeHours * 60 * 60 * 1000)
    : undefined;

  if (statuses.includes('running') || statuses.includes('pending') || statuses.includes('stale')) {
    res.status(400).json({
      error: 'Refusing to clear active/pending queue states in this action.'
    });
    return;
  }

  const result = await prisma.jobQueue.deleteMany({
    where: {
      status: {
        in: statuses
      },
      ...(minimumDate ? {
        createdAt: {
          lt: minimumDate
        }
      } : {})
    }
  });

  await recordAuditEvent(req, {
    action: 'queue.clear',
    entityType: 'JobQueue',
    metadata: {
      statuses,
      deleted: result.count
    }
  });

  res.json({
    deleted: result.count,
    statuses
  });
});
adminApi.get('/queue/summary', requireViewer, async (_req, res) => res.json(await getQueueHealth()));
adminApi.post('/queue/stale/requeue', requireAdmin, async (req, res) => {
  const result = await requeueStaleRunningJobs();

  await recordAuditEvent(req, {
    action: 'queue.requeue_stale',
    entityType: 'JobQueue',
    metadata: {
      count: result.count
    }
  });

  res.json({
    requeued: result.count
  });
});
adminApi.post('/queue/:id/retry', requireAdmin, async (req, res) => {
  const id = routeIdParam(
    req.params.id,
    res
  );

  if (!id) return;

  const result = await retryFailedQueuedJob(id);

  if (result.count === 0) {
    res.status(404).json({
      error: 'Failed queue job not found.'
    });
    return;
  }

  await recordAuditEvent(req, {
    action: 'queue.retry_failed',
    entityType: 'JobQueue',
    entityId: id
  });

  res.json({
    retried: true,
    id
  });
});
adminApi.get('/audit', requireAdmin, async (req, res) => {
  res.json(await getAuditEvents(boundedLimit(req.query.limit, {
    defaultValue: 100,
    max: 500
  })));
});
adminApi.delete('/audit', requireAdmin, async (_req, res) => {
  const result = await clearAuditEvents();
  res.json({
    cleared: result.count
  });
});
adminApi.get('/api-keys', requireAdmin, async (req, res) => {
  const apiKeys = await prisma.apiKey.findMany({
    orderBy: {
      createdAt: 'desc'
    },
    take: boundedLimit(req.query.limit, {
      defaultValue: 100,
      max: 500
    })
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
adminApi.patch('/api-keys/:id', requireAdmin, async (req, res) => {
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const data = parseNonEmptyAdminPayload(apiKeyUpdateSchema, req.body);
  const apiKey = await prisma.apiKey.update({
    where: {
      id
    },
    data
  });

  await recordAuditEvent(req, {
    action: 'apiKey.update',
    entityType: 'ApiKey',
    entityId: apiKey.id,
    metadata: {
      changedFields: Object.keys(data),
      name: apiKey.name,
      role: apiKey.role,
      active: apiKey.active,
      prefix: apiKey.prefix
    }
  });

  res.json(maskApiKey(apiKey));
});
adminApi.delete('/api-keys/:id', requireAdmin, async (req, res) => {
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const apiKey = await prisma.apiKey.update({
    where: {
      id
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
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const job = await prisma.jobRun.findUnique({
    where: {
      id
    }
  });

  if (!job) {
    return res.status(404).json({
      error: 'Job run not found'
    });
  }

  return res.json(job);
});
adminApi.get('/coverage', requireViewer, async (req, res) => {
  const limit = boundedLimit(req.query.limit, {
    defaultValue: 1000,
    max: 5000
  });
  const channels = await prisma.channel.findMany({
    orderBy: {
      displayName: 'asc'
    },
    select: {
      id: true,
      displayName: true,
      country: true,
      category: true
    },
    take: limit
  });
  const typedChannels: CoverageChannelRow[] = channels;
  const channelIds = typedChannels.map((channel) => channel.id);
  const programStats = channelIds.length
    ? await prisma.program.groupBy({
        by: ['channelId'],
        where: {
          channelId: {
            in: channelIds
          }
        },
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
    : [];
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
adminApi.get('/channels', requireViewer, async (req, res) => res.json(await prisma.channel.findMany({
  include: { aliases: true, mappings: true },
  orderBy: { displayName: 'asc' },
  take: boundedLimit(req.query.limit, {
    defaultValue: 500,
    max: 5000
  })
})));
adminApi.patch('/channels/:id', requireAdmin, async (req, res) => {
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const data = parseNonEmptyAdminPayload(channelUpdateSchema, req.body);
  const channel = await prisma.channel.update({ where: { id }, data });

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
  const result = await autoGenerateAliases(data.channelId);

  await recordAuditEvent(req, {
    action: 'channel.alias.generate',
    entityType: 'Channel',
    entityId: data.channelId ?? null,
    metadata: {
      channels: result.channels,
      aliasesCreated: result.aliasesCreated
    }
  });

  res.json(result);
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
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const alias = await prisma.alias.delete({ where: { id } });

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
adminApi.get('/profiles', requireViewer, async (req, res) => res.json(await prisma.exportProfile.findMany({
  orderBy: { name: 'asc' },
  take: boundedLimit(req.query.limit, {
    defaultValue: 100,
    max: 1000
  })
})));
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
  const id = routeIdParam(req.params.id, res);
  if (!id) return;
  const data = parseNonEmptyAdminPayload(profileUpdateSchema, req.body);
  const profile = await prisma.exportProfile.update({ where: { id }, data });

  await recordAuditEvent(req, {
    action: 'profile.update',
    entityType: 'ExportProfile',
    entityId: profile.id,
    metadata: data
  });

  res.json(profile);
});
adminApi.get('/tokens', requireAdmin, async (req, res) => {
  const tokens = await prisma.exportToken.findMany({
    orderBy: { createdAt: 'desc' },
    take: boundedLimit(req.query.limit, {
      defaultValue: 100,
      max: 500
    })
  });

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
adminApi.post('/enrich/tmdb/:programId', requireAdmin, async (req, res) => {
  const programId = routeIdParam(req.params.programId, res);
  if (!programId) return;
  const result = await enrichProgramWithTmdb(programId);

  await recordAuditEvent(req, {
    action: 'program.enrich.tmdb',
    entityType: 'Program',
    entityId: programId
  });

  res.json(result);
});
adminApi.post('/enrich/channel/:channelId/assets', requireAdmin, async (req, res) => {
  const channelId = routeIdParam(req.params.channelId, res);
  if (!channelId) return;
  const data = parseAdminPayload(channelAssetsSchema, req.body);
  const result = await enrichChannelAssets(channelId, data.logo, data.image);

  await recordAuditEvent(req, {
    action: 'channel.assets.enrich',
    entityType: 'Channel',
    entityId: channelId,
    metadata: {
      hasLogo: Boolean(data.logo),
      hasImage: Boolean(data.image)
    }
  });

  res.json(result);
});
adminApi.post('/catchup/:programId', requireAdmin, async (req, res) => {
  const programId = routeIdParam(req.params.programId, res);
  if (!programId) return;
  const data = parseAdminPayload(catchupSchema, req.body);
  const result = await attachCatchupMetadata(programId, data.catchupUrl, data.catchupDays);

  await recordAuditEvent(req, {
    action: 'program.catchup.attach',
    entityType: 'Program',
    entityId: programId,
    metadata: {
      catchupDays: data.catchupDays
    }
  });

  res.json(result);
});
