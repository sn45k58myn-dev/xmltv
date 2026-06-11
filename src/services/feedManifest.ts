import { appInfo } from '../config/appInfo';
import { prisma } from '../db/prisma';

export async function getCountryFeeds() {
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

export async function getSystemStats() {
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

  return {
    channels,
    programs,
    sources,
    countries: countries.length
  };
}

export async function getFeedManifest() {
  const [
    stats,
    countries
  ] = await Promise.all([
    getSystemStats(),
    getCountryFeeds()
  ]);

  return {
    name: appInfo.name,
    version: appInfo.version,
    generatedAt: new Date().toISOString(),
    stats: {
      ...stats,
      countries: countries.length
    },
    countries
  };
}
