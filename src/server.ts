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
import { requireAdmin } from './middleware/auth';
import { getCachedFeed, getCachedFeedGzip } from './services/cacheService';

const app = express();
const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

app.use('/api/stats', statsRoutes);
app.use('/api/source-health', sourceHealthRoutes);
app.use(cors());
app.use(express.json());
app.use(rateLimit);
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/api/admin', adminApi);
app.use('/api/sources', sourceRoutes);
app.use('/api/export-tokens', exportTokenRoutes);
app.get('/monitoring/metrics', async (_req, res) => res.json(await systemMetrics()));

app.get('/health', (_req, res) => res.json({ ok: true }));

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
        type: source.type as any,
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

app.get('/uk.xml', requireExportToken, async (_req, res) => {
  const xml = await getCachedFeed('uk');

  if (!xml) {
    return res.status(404).send('Feed not generated');
  }

  res.setHeader(
    'content-type',
    'application/xml; charset=utf-8'
  );

  res.send(xml);
});

app.get('/uk.xml.gz', requireExportToken, async (_req, res) => {
  const gzip = await getCachedFeedGzip('uk');

  if (!gzip) {
    return res.status(404).send('Feed not generated');
  }

  res.setHeader(
    'content-type',
    'application/gzip'
  );

  res.send(gzip);
});

app.get('/us.xml', requireExportToken, async (_req, res) => {
  const xml = await getCachedFeed('us');

  if (!xml) {
    return res.status(404).send('Feed not generated');
  }

  res.setHeader(
    'content-type',
    'application/xml; charset=utf-8'
  );

  res.send(xml);
});

app.get('/us.xml.gz', requireExportToken, async (_req, res) => {
  const gzip = await getCachedFeedGzip('us');

  if (!gzip) {
    return res.status(404).send('Feed not generated');
  }

  res.setHeader(
    'content-type',
    'application/gzip'
  );

  res.send(gzip);
});

app.get('/sports.xml', requireExportToken, async (_req, res) => sendXml(res, await exportCategory('sports')));
app.get('/movies.xml', requireExportToken, async (_req, res) => sendXml(res, await exportCategory('movies')));
app.get('/profile/:id.xml', requireExportToken, async (req, res) => sendXml(res, await exportProfile(req.params.id)));
app.get('/provider/:id.xml', requireExportToken, async (req, res) => sendXml(res, await exportProvider(req.params.id)));

function sendXml(
  res: express.Response,
  xml: string
) {
  res.setHeader(
    'content-type',
    'application/xml; charset=utf-8'
  );

  res.send(xml);
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

startImportScheduler();

app.get('/debug/channels', async (_req, res) => {
  const channels = await prisma.channel.findMany();
  res.json(channels);
});

app.get('/debug/programs', async (_req, res) => {
  const programs = await prisma.program.findMany({
    take: 20
  });

  res.json(programs);
});

app.get('/channels', async (_req, res) => {
  const channels = await prisma.channel.findMany({
    orderBy: {
      displayName: 'asc'
    }
  });

  res.json(channels);
});

app.get('/programs', async (_req, res) => {
  const programs = await prisma.program.findMany({
    orderBy: {
      start: 'asc'
    },
    take: 100
  });

  res.json(programs);
});

app.get('/coverage', async (_req, res) => {
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