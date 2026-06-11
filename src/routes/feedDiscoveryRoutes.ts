import { Router } from 'express';
import { prisma } from '../db/prisma';

export const feedDiscoveryRoutes = Router();

async function getCountryFeeds() {
  const rows = await prisma.channel.groupBy({
    by: ['country'],
    _count: true,
    where: {
      country: {
        not: null
      }
    }
  });

  return rows
    .filter((r) => r.country)
    .map((r) => ({
      code: r.country,
      channels: r._count,
      xml: `/country/${r.country}.xml`,
      gzip: `/country/${r.country}.xml.gz`
    }))
    .sort((a, b) =>
      String(a.code).localeCompare(String(b.code))
    );
}

feedDiscoveryRoutes.get(
  '/countries',
  async (_req, res) => {
    res.json(await getCountryFeeds());
  }
);

feedDiscoveryRoutes.get(
  '/feeds',
  async (_req, res) => {
    res.json({
      countries: await getCountryFeeds()
    });
  }
);

feedDiscoveryRoutes.get(
  '/system',
  async (_req, res) => {
    const [
      channels,
      programs,
      sources,
      countries
    ] = await Promise.all([
      prisma.channel.count(),
      prisma.program.count(),
      prisma.source.count(),
      prisma.channel.groupBy({
        by: ['country'],
        where: {
          country: {
            not: null
          }
        }
      })
    ]);

    res.json({
      channels,
      programs,
      sources,
      countries: countries.length
    });
  }
);

feedDiscoveryRoutes.get(
  '/manifest',
  async (_req, res) => {
    const [
      channels,
      programs,
      sources,
      countries
    ] = await Promise.all([
      prisma.channel.count(),
      prisma.program.count(),
      prisma.source.count(),
      getCountryFeeds()
    ]);

    res.json({
      name: 'XMLTV Aggregator',
      version: '2.5.0',
      generatedAt: new Date().toISOString(),
      stats: {
        channels,
        programs,
        sources,
        countries: countries.length
      },
      countries
    });
  }
);