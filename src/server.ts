import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { statsRoutes } from './routes/statsRoutes';
import path from 'node:path';
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
import { docsRoutes } from './routes/docsRoutes';
import { requireAdmin } from './middleware/auth';
import { getCachedFeed, getCachedFeedGzip } from './services/cacheService';
import { recordFeedDownload } from './services/downloadMetrics';
import { buildManifest } from './services/manifestService';

const app = express();
const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

app.use(cors());
app.use(express.json());
app.use(rateLimit);

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

app.post('/imports/upload', upload.single('xmltv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing xmltv file upload field' });
  const result = await runImport({ name: `Upload ${req.file.originalname}`, type: 'upload', url: req.file.path, priority: 30 });
  res.json(result);
});

app.post('/profiles', async (req, res) => {
  const profile = await prisma.exportProfile.create({ data: req.body });
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

app.get('/uk.xml', (_req, res) =>
  res.redirect('/country/GB.xml')
);

app.get('/uk.xml.gz', (_req, res) =>
  res.redirect('/country/GB.xml.gz')
);

app.get('/us.xml', (_req, res) =>
  res.redirect('/country/US.xml')
);

app.get('/us.xml.gz', (_req, res) =>
  res.redirect('/country/US.xml.gz')
);

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

startImportScheduler();

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

app.listen(env.PORT, () => {
  console.log(`XMLTV aggregator listening on ${env.BASE_URL}`);
});
