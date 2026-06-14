import 'express-async-errors';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { ZodError } from 'zod';
import { statsRoutes } from './routes/statsRoutes';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from './config/env';
import { assertProductionSafeConfig } from './config/productionGuards';
import { adminApi } from './routes/adminApi';
import { rateLimit } from './middleware/rateLimit';
import { requireMonitoringToken } from './middleware/monitoringAuth';
import { requireExportToken } from './middleware/exportToken';
import { prometheusMetrics, systemMetrics } from './monitoring/metrics';
import { prisma } from './db/prisma';
import { exportCategory, exportProfile, exportProvider } from './exports/exportService';
import { runImport } from './pipeline/importPipeline';
import { startImportScheduler } from './jobs/importScheduler';
import { startJobWorker } from './jobs/jobWorker';
import { sourceRoutes } from './routes/sourceRoutes';
import { exportTokenRoutes } from './routes/exportTokenRoutes';
import { sourceHealthRoutes } from './routes/sourceHealthRoutes';
import { feedDiscoveryRoutes } from './routes/feedDiscoveryRoutes';
import { docsRoutes } from './routes/docsRoutes';
import { requireAdmin } from './middleware/auth';
import { securityHeaders } from './middleware/securityHeaders';
import { createCachedFeedReadStream, getCachedFeedFile } from './services/cacheService';
import { recordFeedDownload } from './services/downloadMetrics';
import { buildManifest } from './services/manifestService';
import { providerFeedKey } from './services/feedKeys';
import { requestMetrics } from './monitoring/requestMetrics';
import { runTrackedJob } from './jobs/jobRuns';
import { requestContext } from './middleware/requestContext';
import { noStore } from './middleware/noStore';
import { cleanupUploadedFile, safeUploadDisplayName, validateUploadedXml } from './services/uploadValidation';
import { assertCacheDirectoryWritable } from './services/cacheService';
import { recordAuditEvent } from './services/auditLog';
import { enqueueJob } from './jobs/jobQueue';
import { runEnabledImports, summarizeImportResults } from './jobs/importWork';
import { parseProfileCreatePayload } from './utils/adminPayloads';
import { boundedLimit } from './utils/limits';
import { enqueueBullJob, startBullJobWorker } from './jobs/bullQueue';
import { closeRedisClient } from './services/redisClient';
import { normalizeCountryParam, safeRouteId } from './utils/routeParams';

assertProductionSafeConfig();
export const app = express();
app.disable('x-powered-by');

const upload = multer({
  dest: path.join(process.cwd(), 'uploads'),
  limits: {
    fileSize: env.UPLOAD_MAX_MB * 1024 * 1024,
    files: 1,
    fields: 5,
    parts: 6
  }
});
const corsOrigins = env.CORS_ORIGIN
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(securityHeaders);
app.use(requestContext);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS origin not allowed'));
  }
}));
app.use(express.json({
  limit: env.JSON_BODY_LIMIT
}));
app.use(rateLimit);
app.use(requestMetrics);

app.use('/api/stats', statsRoutes);
app.use('/api/source-health', noStore, sourceHealthRoutes);
app.use('/api/discovery', feedDiscoveryRoutes);
app.use('/api/docs', docsRoutes);
app.use('/admin', express.static(path.join(__dirname, 'admin'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
  }
}));
app.use('/api/admin', noStore, adminApi);
app.use('/api/sources', noStore, sourceRoutes);
app.use('/api/export-tokens', noStore, exportTokenRoutes);

app.get('/monitoring/metrics', requireMonitoringToken, async (_req, res) => res.json(await systemMetrics()));
app.get('/monitoring/prometheus', requireMonitoringToken, async (_req, res) => {
  res
    .type('text/plain; version=0.0.4; charset=utf-8')
    .send(await prometheusMetrics());
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/ready', async (_req, res) => {
  const checks = {
    database: false,
    cache: false
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
    await assertCacheDirectoryWritable();
    checks.cache = true;

    res.json({
      ok: true,
      ...checks
    });
  } catch {
    res.status(503).json({
      ok: false,
      ...checks
    });
  }
});

app.get(
  '/manifest.json',
  async (_req, res) => {
    res.json(
      await buildManifest()
    );
  }
);

app.get('/sources', requireAdmin, async (_req, res) => res.json(await prisma.source.findMany({ orderBy: { priority: 'asc' } })));

app.post('/api/admin/imports/run', requireAdmin, async (_req, res) => {
  if (env.IMPORT_RUN_MODE === 'queue') {
    if (env.JOB_QUEUE_BACKEND === 'bullmq') {
      const job = await enqueueBullJob('manual-imports');

      await recordAuditEvent(_req, {
        action: 'import.queue',
        entityType: 'BullMQ',
        entityId: job.id,
        metadata: {
          trigger: 'manual',
          backend: 'bullmq'
        }
      });

      res.status(202).json({
        queued: true,
        backend: 'bullmq',
        jobId: job.id,
        status: job.status,
        type: job.type
      });
      return;
    }

    const job = await enqueueJob('manual-imports');

    await recordAuditEvent(_req, {
      action: 'import.queue',
      entityType: 'JobQueue',
      entityId: job.id,
      metadata: {
        trigger: 'manual'
      }
    });

    res.status(202).json({
      queued: true,
      backend: 'database',
      jobId: job.id,
      status: job.status,
      type: job.type
    });
    return;
  }

  const results = await runTrackedJob(
    'manual-imports',
    'manual',
    runEnabledImports,
    summarizeImportResults
  );

  await recordAuditEvent(_req, {
    action: 'import.trigger',
    entityType: 'ImportRun',
    metadata: {
      trigger: 'manual'
    }
  });

  res.json(results);
});

app.post('/imports/upload', requireAdmin, upload.single('xmltv'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Missing xmltv file upload field' });

  try {
    await validateUploadedXml(req.file);
    const result = await runImport({
      name: `Upload ${safeUploadDisplayName(req.file.originalname)}`,
      type: 'upload',
      url: req.file.path,
      priority: 30
    });

    await recordAuditEvent(req, {
      action: 'import.upload',
      entityType: 'ImportRun',
      entityId: 'id' in result ? result.id : undefined,
      metadata: {
        originalName: safeUploadDisplayName(req.file.originalname),
        status: result.status,
        channelsSeen: 'channelsSeen' in result ? result.channelsSeen : undefined,
        programsSeen: 'programsSeen' in result ? result.programsSeen : undefined
      }
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  } finally {
    await cleanupUploadedFile(req.file);
  }
});

app.post('/profiles', requireAdmin, async (req, res) => {
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

app.get(
  '/country/:country.xml',
  requireExportToken,
  async (req, res) => {
    try {
      return sendCachedCountryXml(req, res, normalizeCountryParam(req.params.country));
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid country code.'
      });
    }
  }
);

app.get(
  '/country/:country.xml.gz',
  requireExportToken,
  async (req, res) => {
    try {
      return sendCachedCountryGzip(req, res, normalizeCountryParam(req.params.country));
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid country code.'
      });
    }
  }
);

// Legacy compatibility routes

app.get('/uk.xml', requireExportToken, (req, res) =>
  sendCachedCountryXml(req, res, 'GB')
);

app.get('/uk.xml.gz', requireExportToken, (req, res) =>
  sendCachedCountryGzip(req, res, 'GB')
);

app.get('/us.xml', requireExportToken, (req, res) =>
  sendCachedCountryXml(req, res, 'US')
);

app.get('/us.xml.gz', requireExportToken, (req, res) =>
  sendCachedCountryGzip(req, res, 'US')
);

app.get('/sports.xml', requireExportToken, async (_req, res) => {
  await recordFeedDownload('sports.xml');
  sendXml(res, await exportCategory('sports'));
});
app.get('/movies.xml', requireExportToken, async (_req, res) => {
  await recordFeedDownload('movies.xml');
  sendXml(res, await exportCategory('movies'));
});
app.get('/profile/:id.xml', requireExportToken, async (req, res) => {
  let profileId: string;

  try {
    profileId = safeRouteId(req.params.id);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid route id.'
    });
  }

  await recordFeedDownload(`profile_${profileId}.xml`);
  sendXml(res, await exportProfile(profileId));
});
app.get('/provider/:id.xml', requireExportToken, async (req, res) => {
  let providerId: string;

  try {
    providerId = safeRouteId(req.params.id);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid route id.'
    });
  }

  const key = providerFeedKey(providerId);
  const cached = await getCachedFeedFile(key, '.xml');

  if (cached) {
    return sendCachedFeedFile(
      req,
      res,
      cached,
      'application/xml; charset=utf-8',
      `${key}.xml`
    );
  }

  await recordFeedDownload(`${key}.xml`);
  return sendXml(res, await exportProvider(providerId));
});

app.get('/provider/:id.xml.gz', requireExportToken, async (req, res) => {
  let providerId: string;

  try {
    providerId = safeRouteId(req.params.id);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid route id.'
    });
  }

  const key = providerFeedKey(providerId);
  const gzip = await getCachedFeedFile(key, '.xml.gz');

  if (!gzip) {
    return res.status(404).send('Feed not generated');
  }

  return sendCachedFeedFile(
    req,
    res,
    gzip,
    'application/gzip',
    `${key}.xml.gz`
  );
});

function setFeedCacheHeaders(res) {
  const cacheScope = env.PUBLIC_EXPORTS === 'true'
    ? 'public'
    : 'private';

  res.setHeader(
    'cache-control',
    `${cacheScope}, max-age=${env.FEED_CACHE_MAX_AGE_SECONDS}`
  );

  if (env.PUBLIC_EXPORTS !== 'true') {
    res.vary('x-export-token');
  }
}

function setEntityTag(
  res,
  body: string | Buffer
) {
  const hash = crypto
    .createHash('sha256')
    .update(body)
    .digest('base64url');

  res.setHeader('etag', `"${hash}"`);
}

function cachedFileEntityTag(
  file: {
    size: number;
    mtime: Date;
  }
) {
  return `W/"${file.size.toString(16)}-${file.mtime.getTime().toString(16)}"`;
}

function setFileEntityTag(
  res,
  file: {
    size: number;
    mtime: Date;
  }
) {
  res.setHeader('etag', cachedFileEntityTag(file));
}

function requestHasEntityTag(
  req,
  etag: string
) {
  const header = req.get('if-none-match');

  if (!header) {
    return false;
  }

  return header
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag);
}

function httpDateTime(value: Date) {
  return Math.floor(value.getTime() / 1000) * 1000;
}

function requestFreshForFile(
  req,
  file: {
    size: number;
    mtime: Date;
  }
) {
  const etag = cachedFileEntityTag(file);

  if (requestHasEntityTag(req, etag)) {
    return true;
  }

  const modifiedSince = req.get('if-modified-since');

  if (!modifiedSince) {
    return false;
  }

  const modifiedSinceMs = Date.parse(modifiedSince);

  if (!Number.isFinite(modifiedSinceMs)) {
    return false;
  }

  return httpDateTime(file.mtime) <= httpDateTime(new Date(modifiedSinceMs));
}

function sendXml(
  res,
  xml
) {
  setFeedCacheHeaders(res);
  setEntityTag(res, xml);
  res.setHeader(
    'content-type',
    'application/xml; charset=utf-8'
  );

  res.send(xml);
}

function sendCachedFeedFile(
  req,
  res,
  file,
  contentType: string,
  feedKey?: string
) {
  setFeedCacheHeaders(res);
  setFileEntityTag(res, file);
  res.setHeader('last-modified', file.mtime.toUTCString());

  if (requestFreshForFile(req, file)) {
    return res.status(304).end();
  }

  res.setHeader('content-type', contentType);
  res.setHeader('content-length', String(file.size));

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  if (feedKey) {
    void recordFeedDownload(feedKey);
  }

  return createCachedFeedReadStream(file)
    .on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Unable to stream cached feed'
        });
        return;
      }

      res.destroy(error);
    })
    .pipe(res);
}

async function sendCachedCountryXml(
  req,
  res,
  country: string
) {
  const file = await getCachedFeedFile(country, '.xml');

  if (!file) {
    return res.status(404).send('Feed not generated');
  }

  return sendCachedFeedFile(
    req,
    res,
    file,
    'application/xml; charset=utf-8',
    `${country}.xml`
  );
}

async function sendCachedCountryGzip(
  req,
  res,
  country: string
) {
  const file = await getCachedFeedFile(country, '.xml.gz');

  if (!file) {
    return res.status(404).send('Feed not generated');
  }

  return sendCachedFeedFile(
    req,
    res,
    file,
    'application/gzip',
    `${country}.xml.gz`
  );
}

app.get('/', (_req, res) => {
  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>XMLTV Aggregator</title>
      </head>
      <body>
        <main>
          <h1>XMLTV Aggregator</h1>
          <p>Service is running.</p>
          <p><a href="/admin">Open admin</a></p>
        </main>
      </body>
    </html>
  `);
});

if (env.ENABLE_DEBUG_ROUTES === 'true') {
  app.get('/debug/channels', noStore, requireAdmin, async (_req, res) => {
    const channels = await prisma.channel.findMany({
      take: 500
    });
    res.json(channels);
  });

  app.get('/debug/programs', noStore, requireAdmin, async (_req, res) => {
    const programs = await prisma.program.findMany({
      take: 100,
      orderBy: {
        start: 'desc'
      }
    });

    res.json(programs);
  });
}

app.get('/channels', noStore, requireAdmin, async (req, res) => {
  const channels = await prisma.channel.findMany({
    orderBy: {
      displayName: 'asc'
    },
    take: boundedLimit(req.query.limit, {
      defaultValue: 500,
      max: 5000
    })
  });

  res.json(channels);
});

app.get('/programs', noStore, requireAdmin, async (_req, res) => {
  const programs = await prisma.program.findMany({
    orderBy: {
      start: 'asc'
    },
    take: 100
  });

  res.json(programs);
});

app.get('/coverage', noStore, requireAdmin, async (_req, res) => {
  const channels = await prisma.channel.count();
  const programs = await prisma.program.count();
  const aliases = await prisma.alias.count();
  const sources = await prisma.source.count();

  res.json({
    channels,
    programs,
    aliases,
    sources
  });
});

app.use((
  error: unknown,
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  const requestId = req.requestId;

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      requestId,
      error: error.code === 'LIMIT_FILE_SIZE'
        ? `Uploaded file exceeds ${env.UPLOAD_MAX_MB} MB limit.`
        : error.code === 'LIMIT_FILE_COUNT'
          ? 'Upload accepts exactly one XMLTV file.'
          : 'Invalid multipart upload.'
    });
  }

  if (error instanceof Error && error.message.startsWith('Uploaded XMLTV file')) {
    return res.status(400).json({
      requestId,
      error: error.message
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      requestId,
      error: 'Invalid request payload.',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message
      }))
    });
  }

  console.error('Unhandled request error:', error);

  return res.status(500).json({
    requestId,
    error: 'Internal server error'
  });
});

export async function startServer() {
  await assertCacheDirectoryWritable();

  const closeScheduler = env.ENABLE_SCHEDULER === 'true'
    ? startImportScheduler()
    : undefined;

  if (env.ENABLE_SCHEDULER !== 'true') {
    console.log('Import scheduler disabled');
  }

  const closeBullWorker = startBullJobWorker();
  const closeJobWorker = env.JOB_QUEUE_BACKEND !== 'bullmq'
    ? startJobWorker()
    : undefined;

  const server = app.listen(env.PORT, () => {
    console.log(`XMLTV aggregator listening on ${env.BASE_URL}`);
  });

  async function shutdown(signal: string) {
    console.log(`Received ${signal}, shutting down`);

    server.close(async () => {
      await closeScheduler?.();
      await closeBullWorker?.();
      await closeJobWorker?.();
      await closeRedisClient();
      await prisma.$disconnect();
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  return server;
}

if (require.main === module) {
  void startServer();
}
