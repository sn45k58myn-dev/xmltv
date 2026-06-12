import 'express-async-errors';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { statsRoutes } from './routes/statsRoutes';
import path from 'node:path';
import { env } from './config/env';
import { assertProductionSafeConfig } from './config/productionGuards';
import { adminApi } from './routes/adminApi';
import { rateLimit } from './middleware/rateLimit';
import { requireExportToken } from './middleware/exportToken';
import { systemMetrics } from './monitoring/metrics';
import { prisma } from './db/prisma';
import { exportCategory, exportProfile, exportProvider } from './exports/exportService';
import { runImport } from './pipeline/importPipeline';
import { startImportScheduler } from './jobs/importScheduler';
import { sourceRoutes } from './routes/sourceRoutes';
import { exportTokenRoutes } from './routes/exportTokenRoutes';
import { sourceHealthRoutes } from './routes/sourceHealthRoutes';
import { feedDiscoveryRoutes } from './routes/feedDiscoveryRoutes';
import { docsRoutes } from './routes/docsRoutes';
import { requireAdmin } from './middleware/auth';
import { securityHeaders } from './middleware/securityHeaders';
import { getCachedFeed, getCachedFeedGzip } from './services/cacheService';
import { recordFeedDownload } from './services/downloadMetrics';
import { buildManifest } from './services/manifestService';
import { providerFeedKey } from './services/feedKeys';
import { requestMetrics } from './monitoring/requestMetrics';
import { runTrackedJob } from './jobs/jobRuns';
import { requestContext } from './middleware/requestContext';
import { cleanupUploadedFile, validateUploadedXml } from './services/uploadValidation';

assertProductionSafeConfig();
export const app = express();
const upload = multer({
  dest: path.join(process.cwd(), 'uploads'),
  limits: {
    fileSize: env.UPLOAD_MAX_MB * 1024 * 1024
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
app.use('/api/source-health', sourceHealthRoutes);
app.use('/api/discovery', feedDiscoveryRoutes);
app.use('/api/docs', docsRoutes);
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/api/admin', adminApi);
app.use('/api/sources', sourceRoutes);
app.use('/api/export-tokens', exportTokenRoutes);

app.get('/monitoring/metrics', async (_req, res) => res.json(await systemMetrics()));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      database: true
    });
  } catch {
    res.status(503).json({
      ok: false,
      database: false
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
  const results = await runTrackedJob(
    'manual-imports',
    'manual',
    async () => {
      const sources = await prisma.source.findMany({
        where: {
          enabled: true
        },
        orderBy: {
          priority: 'asc'
        }
      });

      const importResults = [];

      for (const source of sources) {
        importResults.push(
          await runImport({
            name: source.name,
            type: source.type,
            url: source.url ?? undefined,
            priority: source.priority
          })
        );
      }

      return importResults;
    },
    (importResults) => {
      const failed = importResults.filter((result) => result.status === 'failed').length;

      return `Imported ${importResults.length - failed}, failed ${failed}`;
    }
  );

  res.json(results);
});

app.post('/imports/upload', requireAdmin, upload.single('xmltv'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Missing xmltv file upload field' });

  try {
    await validateUploadedXml(req.file);
    const result = await runImport({ name: `Upload ${req.file.originalname}`, type: 'upload', url: req.file.path, priority: 30 });
    return res.json(result);
  } catch (error) {
    return next(error);
  } finally {
    await cleanupUploadedFile(req.file);
  }
});

app.post('/profiles', requireAdmin, async (req, res) => {
  const profile = await prisma.exportProfile.create({ data: req.body });
  res.status(201).json(profile);
});

app.get(
  '/country/:country.xml',
  requireExportToken,
  async (req, res) => {
    const country = req.params.country.toUpperCase();
    return sendCachedCountryXml(res, country);
  }
);

app.get(
  '/country/:country.xml.gz',
  requireExportToken,
  async (req, res) => {
    const country = req.params.country.toUpperCase();
    return sendCachedCountryGzip(res, country);
  }
);

// Legacy compatibility routes

app.get('/uk.xml', requireExportToken, (_req, res) =>
  sendCachedCountryXml(res, 'GB')
);

app.get('/uk.xml.gz', requireExportToken, (_req, res) =>
  sendCachedCountryGzip(res, 'GB')
);

app.get('/us.xml', requireExportToken, (_req, res) =>
  sendCachedCountryXml(res, 'US')
);

app.get('/us.xml.gz', requireExportToken, (_req, res) =>
  sendCachedCountryGzip(res, 'US')
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
  await recordFeedDownload(`profile_${req.params.id}.xml`);
  sendXml(res, await exportProfile(req.params.id));
});
app.get('/provider/:id.xml', requireExportToken, async (req, res) => {
  const key = providerFeedKey(req.params.id);
  const cached = await getCachedFeed(key);
  const xml = cached ?? await exportProvider(req.params.id);

  await recordFeedDownload(`${key}.xml`);

  sendXml(res, xml);
});

app.get('/provider/:id.xml.gz', requireExportToken, async (req, res) => {
  const key = providerFeedKey(req.params.id);
  const gzip = await getCachedFeedGzip(key);

  if (!gzip) {
    return res.status(404).send('Feed not generated');
  }

  await recordFeedDownload(`${key}.xml.gz`);

  res.setHeader(
    'content-type',
    'application/gzip'
  );
  setFeedCacheHeaders(res);

  res.send(gzip);
});

function setFeedCacheHeaders(res) {
  res.setHeader(
    'cache-control',
    `public, max-age=${env.FEED_CACHE_MAX_AGE_SECONDS}`
  );
}

function sendXml(
  res,
  xml
) {
  setFeedCacheHeaders(res);
  res.setHeader(
    'content-type',
    'application/xml; charset=utf-8'
  );

  res.send(xml);
}

async function sendCachedCountryXml(
  res,
  country: string
) {
  const xml = await getCachedFeed(country);

  if (!xml) {
    return res.status(404).send('Feed not generated');
  }

  await recordFeedDownload(`${country}.xml`);

  return sendXml(res, xml);
}

async function sendCachedCountryGzip(
  res,
  country: string
) {
  const gzip = await getCachedFeedGzip(country);

  if (!gzip) {
    return res.status(404).send('Feed not generated');
  }

  await recordFeedDownload(`${country}.xml.gz`);

  res.setHeader(
    'content-type',
    'application/gzip'
  );
  setFeedCacheHeaders(res);

  return res.send(gzip);
}

app.get('/', (_req, res) => {
  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>XMLTV Aggregator</title>
        <style>
          body{font-family:system-ui,Segoe UI,sans-serif;margin:0;background:#f6f7fb;color:#172033;display:grid;min-height:100vh;place-items:center}
          main{max-width:36rem;padding:2rem;text-align:center}
          a{color:#172033;font-weight:700}
        </style>
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
  app.get('/debug/channels', requireAdmin, async (_req, res) => {
    const channels = await prisma.channel.findMany({
      take: 500
    });
    res.json(channels);
  });

  app.get('/debug/programs', requireAdmin, async (_req, res) => {
    const programs = await prisma.program.findMany({
      take: 100,
      orderBy: {
        start: 'desc'
      }
    });

    res.json(programs);
  });
}

app.get('/channels', requireAdmin, async (_req, res) => {
  const channels = await prisma.channel.findMany({
    orderBy: {
      displayName: 'asc'
    }
  });

  res.json(channels);
});

app.get('/programs', requireAdmin, async (_req, res) => {
  const programs = await prisma.program.findMany({
    orderBy: {
      start: 'asc'
    },
    take: 100
  });

  res.json(programs);
});

app.get('/coverage', requireAdmin, async (_req, res) => {
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
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: error.code === 'LIMIT_FILE_SIZE'
        ? `Uploaded file exceeds ${env.UPLOAD_MAX_MB} MB limit.`
        : 'Invalid multipart upload.'
    });
  }

  if (error instanceof Error && error.message.startsWith('Uploaded XMLTV file')) {
    return res.status(400).json({
      error: error.message
    });
  }

  console.error('Unhandled request error:', error);

  return res.status(500).json({
    error: 'Internal server error'
  });
});

export function startServer() {
  if (env.ENABLE_SCHEDULER === 'true') {
    startImportScheduler();
  } else {
    console.log('Import scheduler disabled');
  }

  const server = app.listen(env.PORT, () => {
    console.log(`XMLTV aggregator listening on ${env.BASE_URL}`);
  });

  async function shutdown(signal: string) {
    console.log(`Received ${signal}, shutting down`);

    server.close(async () => {
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
  startServer();
}
