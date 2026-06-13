import 'express-async-errors';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { statsRoutes } from './routes/statsRoutes';
import path from 'node:path';
import { ZodError } from 'zod';
import { env } from './config/env';
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
import { requireAdmin } from './middleware/auth';
import { getCachedFeed, getCachedFeedGzip } from './services/cacheService';
import { recordFeedDownload } from './services/downloadMetrics';
import { getFeedManifest } from './services/feedManifest';
import { parseProfileCreatePayload } from './utils/adminPayloads';

export const app = express();
const upload = multer({
  dest: path.join(process.cwd(), 'uploads'),
  limits: {
    fileSize: env.UPLOAD_MAX_MB * 1024 * 1024
  }
});

app.use(cors());
app.use(express.json({
  limit: env.JSON_BODY_LIMIT
}));
app.use(rateLimit);

app.use('/api/stats', statsRoutes);
app.use('/api/source-health', sourceHealthRoutes);
app.use('/api/discovery', feedDiscoveryRoutes);
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/api/admin', adminApi);
app.use('/api/sources', sourceRoutes);
app.use('/api/export-tokens', exportTokenRoutes);

app.get('/monitoring/metrics', async (_req, res) => res.json(await systemMetrics()));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get(
  '/manifest.json',
  async (_req, res) => {
    res.json(await getFeedManifest());
  }
);

app.get('/sources', async (_req, res) => res.json(await prisma.source.findMany({ orderBy: { priority: 'asc' } })));

app.post('/api/admin/imports/run', requireAdmin, async (_req, res) => {
  const sources = await prisma.source.findMany({
    where: {
      enabled: true
    },
    orderBy: {
      priority: 'asc'
    }
  });

  const results = [];

  for (const source of sources) {
    results.push(
      await runImport({
        name: source.name,
        type: source.type,
        url: source.url ?? undefined,
        priority: source.priority
      })
    );
  }

  res.json(results);
});

async function validateUploadedXml(file: Express.Multer.File) {
  const handle = await fs.open(file.path, 'r');

  try {
    const buffer = Buffer.alloc(256);
    const result = await handle.read(
      buffer,
      0,
      buffer.length,
      0
    );
    const prefix = buffer.subarray(0, result.bytesRead).toString('utf8').trimStart();

    if (!prefix.startsWith('<')) {
      throw new Error('Uploaded file does not look like XML.');
    }
  } finally {
    await handle.close();
  }
}

async function cleanupUploadedFile(file?: Express.Multer.File) {
  if (!file) return;

  await fs.unlink(file.path).catch(() => undefined);
}

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
  const data = parseProfileCreatePayload(req.body);
  const profile = await prisma.exportProfile.create({ data });
  res.status(201).json(profile);
});

app.get(
  '/country/:country.xml',
  requireExportToken,
  async (req, res) => {
    const country = req.params.country.toUpperCase();

    const xml = await getCachedFeed(country);

    if (!xml) {
      return res.status(404).send('Feed not generated');
    }

    await recordFeedDownload(
      `${country}.xml`
    );

    res.setHeader(
      'content-type',
      'application/xml; charset=utf-8'
    );

    res.send(xml);
  }
);

app.get(
  '/country/:country.xml.gz',
  requireExportToken,
  async (req, res) => {
    const country = req.params.country.toUpperCase();

    const gzip = await getCachedFeedGzip(country);

    if (!gzip) {
      return res.status(404).send('Feed not generated');
    }

    await recordFeedDownload(
      `${country}.xml.gz`
    );

    res.setHeader(
      'content-type',
      'application/gzip'
    );

    res.send(gzip);
  }
);

// Legacy compatibility routes

app.get('/uk.xml', requireExportToken, (_req, res) => sendCachedCountryXml(res, 'GB'));

app.get('/uk.xml.gz', requireExportToken, (_req, res) => sendCachedCountryGzip(res, 'GB'));

app.get('/us.xml', requireExportToken, (_req, res) => sendCachedCountryXml(res, 'US'));

app.get('/us.xml.gz', requireExportToken, (_req, res) => sendCachedCountryGzip(res, 'US'));

app.get('/sports.xml', requireExportToken, async (_req, res) => sendXml(res, await exportCategory('sports')));
app.get('/movies.xml', requireExportToken, async (_req, res) => sendXml(res, await exportCategory('movies')));
app.get('/profile/:id.xml', requireExportToken, async (req, res) => sendXml(res, await exportProfile(req.params.id)));
app.get('/provider/:id.xml', requireExportToken, async (req, res) => sendXml(res, await exportProvider(req.params.id)));

function sendXml(
  res,
  xml
) {
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

  return res.send(gzip);
}

app.get('/', (_req, res) => {
  res.send(`
    <h1>XMLTV Aggregator</h1>
    <ul>
      <li><a href="/health">Health</a></li>
      <li><a href="/sources">Sources</a></li>
      <li><a href="/monitoring/metrics">Metrics</a></li>
      <li><a href="/admin">Admin</a></li>
    </ul>
  `);
});

app.get('/debug/channels', requireAdmin, async (_req, res) => {
  const channels = await prisma.channel.findMany();
  res.json(channels);
});

app.get('/debug/programs', requireAdmin, async (_req, res) => {
  const programs = await prisma.program.findMany({
    take: 20
  });

  res.json(programs);
});

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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid request payload.',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message
      }))
    });
  }

  if (error instanceof Error && error.message.includes('does not look like XML')) {
    return res.status(400).json({
      error: error.message
    });
  }

  console.error('Unhandled request error:', error);

  return res.status(500).json({
    error: 'Internal server error'
  });
});

if (require.main === module) {
  startImportScheduler();

  app.listen(env.PORT, () => {
    console.log(`XMLTV aggregator listening on ${env.BASE_URL}`);
  });
}
