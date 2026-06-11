import { Router } from 'express';
import { prisma } from '../db/prisma';

export const feedDiscoveryRoutes = Router();

feedDiscoveryRoutes.get('/countries', async (_req, res) => {
  const rows = await prisma.channel.groupBy({
    by: ['country'],
    _count: true,
    where: { country: { not: null } }
  });

  res.json(rows.map((r) => ({
    code: r.country,
    channels: r._count,
    xml: `/country/${r.country}.xml`,
    gzip: `/country/${r.country}.xml.gz`
  })));
});

feedDiscoveryRoutes.get('/system', async (_req, res) => {
  const [channels, programs, sources] = await Promise.all([
    prisma.channel.count(),
    prisma.program.count(),
    prisma.source.count()
  ]);

  res.json({ channels, programs, sources });
});

feedDiscoveryRoutes.get('/feeds', async (_req, res) => {
  const rows = await prisma.channel.groupBy({
    by: ['country'],
    _count: true,
    where: { country: { not: null } }
  });

  res.json({
    countries: rows.map((r) => ({
      code: r.country,
      channels: r._count,
      xml: `/country/${r.country}.xml`,
      gzip: `/country/${r.country}.xml.gz`
    }))
  });
});
