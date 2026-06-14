import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { writeXmltv } from './xmltvWriter';

const categoryMap: Record<string, string[]> = {
  sports: ['sport', 'sports', 'football', 'soccer', 'rugby', 'cricket', 'tennis'],
  movies: ['movie', 'movies', 'film', 'cinema']
};

function exportProgramWindow() {
  const now = new Date();
  const earliestStop = new Date(
    now.getTime() - env.EXPORT_PAST_HOURS * 60 * 60 * 1000
  );
  const latestStart = new Date(
    now.getTime() + env.EXPORT_FUTURE_DAYS * 24 * 60 * 60 * 1000
  );

  return {
    stop: {
      gte: earliestStop
    },
    start: {
      lte: latestStart
    }
  };
}

function containsInsensitive(term: string) {
  return {
    contains: term,
    mode: 'insensitive' as const
  };
}

function profileChannelIds(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Export profile channelIds must be a JSON array of channel ids.');
  }

  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('Export profile channelIds must be a JSON array of channel ids.');
  }

  return Array.from(
    new Set(parsed.map((id) => id.trim()))
  );
}

export async function exportCountry(country: string): Promise<string> {
  const normalized =
    country.toLowerCase() === 'uk'
      ? 'GB'
      : country.toUpperCase();

  const channels = await prisma.channel.findMany({
    where: {
      country: normalized
    },
    include: {
      aliases: true,
      programs: {
        where: exportProgramWindow(),
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
    where: { OR: terms.map((term) => ({ category: containsInsensitive(term) })) },
    include: {
      aliases: true,
      programs: {
        where: {
          AND: [
            exportProgramWindow(),
            { OR: terms.map((term) => ({ category: containsInsensitive(term) })) }
          ]
        },
        orderBy: { start: 'asc' }
      }
    },
    orderBy: { displayName: 'asc' }
  });
  return writeXmltv(channels.filter((c) => c.programs.length));
}

export async function exportProfile(id: string): Promise<string> {
  const profile = await prisma.exportProfile.findUniqueOrThrow({ where: { id } });
  const channelIds = profileChannelIds(profile.channelIds);
  const channels = await prisma.channel.findMany({
    where: {
      ...(profile.country ? { country: profile.country } : {}),
      ...(profile.category ? { category: containsInsensitive(profile.category) } : {}),
      ...(channelIds?.length ? { id: { in: channelIds } } : {})
    },
    include: {
      aliases: true,
      programs: {
        where: exportProgramWindow(),
        orderBy: { start: 'asc' }
      }
    },
    orderBy: { displayName: 'asc' }
  });
  return writeXmltv(channels);
}

export async function exportProvider(providerId: string): Promise<string> {
  const mappings = await prisma.mapping.findMany({
    where: {
      providerId
    },
    include: {
      channel: {
        include: {
          aliases: true,
          programs: {
            where: exportProgramWindow(),
            orderBy: {
              start: 'asc'
            }
          }
        }
      }
    },
    orderBy: {
      channel: {
        displayName: 'asc'
      }
    }
  });

  const channels = mappings.map((mapping) => ({
    ...mapping.channel,
    xmltvId: mapping.providerChannelId
  }));

  return writeXmltv(channels);
}
