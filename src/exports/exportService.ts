import { prisma } from '../db/prisma';
import { writeXmltv } from './xmltvWriter';

const categoryMap: Record<string, string[]> = {
  sports: ['sport', 'sports', 'football', 'soccer', 'rugby', 'cricket', 'tennis'],
  movies: ['movie', 'movies', 'film', 'cinema']
};

export async function exportCountry(_country: string): Promise<string> {
  const channels = await prisma.channel.findMany({
    include: {
      programs: {
        orderBy: {
          start: 'asc'
        }
      }
    },
    orderBy: {
      displayName: 'asc'
    }
  });

  return writeXmltv(channels);
}

export async function exportCategory(category: string): Promise<string> {
  const terms = categoryMap[category.toLowerCase()] ?? [category.toLowerCase()];
  const channels = await prisma.channel.findMany({
    where: { OR: terms.map((term) => ({ category: { contains: term } })) },
    include: { programs: { where: { OR: terms.map((term) => ({ category: { contains: term } })) }, orderBy: { start: 'asc' } } },
    orderBy: { displayName: 'asc' }
  });
  return writeXmltv(channels.filter((c) => c.programs.length));
}

export async function exportProfile(id: string): Promise<string> {
  const profile = await prisma.exportProfile.findUniqueOrThrow({ where: { id } });
  const channelIds = profile.channelIds ? JSON.parse(profile.channelIds) as string[] : undefined;
  const channels = await prisma.channel.findMany({
    where: {
      ...(profile.country ? { country: profile.country } : {}),
      ...(profile.category ? { category: { contains: profile.category } } : {}),
      ...(channelIds?.length ? { id: { in: channelIds } } : {})
    },
    include: { programs: { orderBy: { start: 'asc' } } },
    orderBy: { displayName: 'asc' }
  });
  return writeXmltv(channels);
}

export async function exportProvider(providerId: string): Promise<string> {
  const mappings = await prisma.mapping.findMany({ where: { providerId }, select: { channelId: true } });
  const channels = await prisma.channel.findMany({
    where: { id: { in: mappings.map((m) => m.channelId) } },
    include: { programs: { orderBy: { start: 'asc' } } },
    orderBy: { displayName: 'asc' }
  });
  return writeXmltv(channels);
}
