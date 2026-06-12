import { prisma } from '../db/prisma';
import { appInfo } from '../config/appInfo';
import { providerFeedKey } from './feedKeys';

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
      String(a.code).localeCompare(
        String(b.code)
      )
    );
}

export async function getProviderFeeds() {
  const rows = await prisma.mapping.groupBy({
    by: ['providerId'],
    _count: true,
    orderBy: {
      providerId: 'asc'
    }
  });

  return rows.map((row) => ({
    feedKey: providerFeedKey(row.providerId),
    providerId: row.providerId,
    channels: row._count,
    xml: `/provider/${row.providerId}.xml`,
    gzip: `/provider/${row.providerId}.xml.gz`
  }));
}

export async function getSystemStats() {
  const [
    channels,
    programs,
    sources,
    countries,
    providers
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
    }),
    prisma.mapping.groupBy({
      by: ['providerId']
    })
  ]);

  return {
    channels,
    programs,
    sources,
    countries: countries.length,
    providers: providers.length
  };
}

export async function buildManifest() {
  const [
    stats,
    countries,
    providers
  ] = await Promise.all([
    getSystemStats(),
    getCountryFeeds(),
    getProviderFeeds()
  ]);

  return {
    name: appInfo.name,
    version: appInfo.version,
    generatedAt: new Date().toISOString(),
    stats: {
      ...stats,
      countries: countries.length,
      providers: providers.length
    },
    countries,
    providers
  };
}
