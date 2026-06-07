import cors from 'cors';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { env } from './config/env';
import { adminApi } from './routes/adminApi';
import { rateLimit } from './middleware/rateLimit';
import { requireExportToken } from './middleware/exportToken';
import { systemMetrics } from './monitoring/metrics';
import { prisma } from './db/prisma';
import { exportCategory, exportCountry, exportProfile, exportProvider } from './exports/exportService';
import { runImport } from './pipeline/importPipeline';
import { getConfiguredSources } from './sources/sourceRegistry';

const app = express();
const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

app.use(cors());
app.use(express.json());
app.use(rateLimit);
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/api/admin', adminApi);
app.get('/monitoring/metrics', async (_req, res) => res.json(await systemMetrics()));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/sources', async (_req, res) => res.json(await prisma.source.findMany({ orderBy: { priority: 'asc' } })));

app.post('/imports/run', async (_req, res) => {
  const results = [];
  for (const source of getConfiguredSources()) results.push(await runImport(source));
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

app.get('/uk.xml', requireExportToken, async (_req, res) => sendXml(res, await exportCountry('uk')));
app.get('/us.xml', requireExportToken, async (_req, res) => sendXml(res, await exportCountry('us')));
app.get('/sports.xml', requireExportToken, async (_req, res) => sendXml(res, await exportCategory('sports')));
app.get('/movies.xml', requireExportToken, async (_req, res) => sendXml(res, await exportCategory('movies')));
app.get('/profile/:id.xml', requireExportToken, async (req, res) => sendXml(res, await exportProfile(req.params.id)));
app.get('/provider/:id.xml', requireExportToken, async (req, res) => sendXml(res, await exportProvider(req.params.id)));

function sendXml(res: express.Response, xml: string) {
  res.setHeader('content-type', 'application/xml; charset=utf-8');
  res.send(xml);
}

app.listen(env.PORT, () => console.log(`XMLTV aggregator listening on ${env.BASE_URL}`));
