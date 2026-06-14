import { getLatestProgramStart } from '../services/programWindow';
import { sourceChanged } from '../services/sourceChanged';
import { prisma } from '../db/prisma';
import { fetchXmltvSource } from '../sources/fetchers';
import { checksum, normalizeName } from '../utils/normalize';
import { parseXmltv } from './parseXmltv';
import { validateXmltv } from './validateXmltv';
import { enrichChannel } from '../enrichment/channelMetadata';
import { recordSourceFailure } from '../services/sourceReliability';

async function upsertSource(definition) {
  return prisma.source.upsert({
    where: { name: definition.name },
    create: {
      name: definition.name,
      type: definition.type,
      url: definition.url,
      priority: definition.priority ?? 100,
    },
    update: {
      type: definition.type,
      url: definition.url,
      priority: definition.priority ?? 100,
      enabled: true,
    },
  });
}

function sourceRefsFor(channel) {
  if (!channel.sourceRefs) {
    return [];
  }

  try {
    const refs = JSON.parse(channel.sourceRefs);

    return Array.isArray(refs) ? refs : [];
  } catch {
    return [];
  }
}

const sourceCountryRules: Array<{
  match: RegExp;
  country: string;
}> = [
  { match: /\b(uk|united kingdom|great britain|freeview)\b/i, country: 'GB' },
  { match: /\b(us|usa|united states)\b/i, country: 'US' },
  { match: /\b(australia)\b/i, country: 'AU' },
  { match: /\b(ireland)\b/i, country: 'IE' },
  { match: /\b(italy)\b/i, country: 'IT' },
  { match: /\b(portugal)\b/i, country: 'PT' },
  { match: /\b(new zealand|newzealand)\b/i, country: 'NZ' },
  { match: /\b(france)\b/i, country: 'FR' },
  { match: /\b(germany)\b/i, country: 'DE' },
  { match: /\b(spain)\b/i, country: 'ES' },
  { match: /\b(netherlands)\b/i, country: 'NL' },
  { match: /\b(denmark)\b/i, country: 'DK' },
  { match: /\b(norway)\b/i, country: 'NO' },
  { match: /\b(poland)\b/i, country: 'PL' }
];

function inferSourceCountry(source) {
  const value = `${source.name ?? ''} ${source.url ?? ''}`;
  const rule = sourceCountryRules.find((item) => item.match.test(value));

  return rule?.country;
}

function channelCountry(
  input,
  source,
  metadata
) {
  return input.country ??
    metadata.country ??
    inferSourceCountry(source) ??
    null;
}

async function ensureSourceRef(
  channel,
  source,
  sourceChannelId: string
) {
  const refs = sourceRefsFor(channel);
  const exists = refs.some((ref) =>
    ref?.sourceId === source.id &&
    ref?.sourceChannelId === sourceChannelId
  );

  if (exists) {
    return channel;
  }

  const updatedRefs = [
    ...refs,
    {
      sourceId: source.id,
      sourceChannelId
    }
  ];

  return prisma.channel.update({
    where: {
      id: channel.id
    },
    data: {
      sourceRefs: JSON.stringify(updatedRefs)
    }
  });
}

async function findOrCreateChannel(input, source) {
  const normalized = normalizeName(input.displayName);
  const metadata = enrichChannel(input.displayName);
  const country = channelCountry(
    input,
    source,
    metadata
  );

  const existingById = await prisma.channel.findUnique({
    where: { xmltvId: input.id },
  });

  if (existingById) {
    return {
      channel: await ensureSourceRef(
        existingById,
        source,
        input.id
      ),
      created: false
    };
  }

  const alias = await prisma.alias.findFirst({
    where: {
      normalized,
      channel: {
        country
      }
    },
  });

  if (alias) {
    return {
      channel: await ensureSourceRef(
        await prisma.channel.findUniqueOrThrow({
          where: { id: alias.channelId },
        }),
        source,
        input.id
      ),
      created: false,
    };
  }

  const similar = await prisma.channel.findFirst({
    where: {
      normalized,
      country
    },
  });

  if (similar) {
    await prisma.alias.create({
      data: {
        channelId: similar.id,
        value: input.displayName,
        normalized,
      },
    }).catch(() => null);

    return {
      channel: await ensureSourceRef(
        similar,
        source,
        input.id
      ),
      created: false
    };
  }

  const channel = await prisma.channel.create({
    data: {
      xmltvId: input.id,
      displayName: input.displayName,
      normalized,
      country,
      category: input.category ?? metadata.category,
      icon: input.icon,
      sourceRefs: JSON.stringify([
        {
          sourceId: source.id,
          sourceChannelId: input.id,
        },
      ]),
      aliases: {
        create: [
          {
            value: input.displayName,
            normalized,
          },
          ...(input.aliases ?? []).map((value) => ({
            value,
            normalized: normalizeName(value),
          })),
        ],
      },
    },
  });

  return { channel, created: true };
}

export async function runImport(definition) {
  const source = await upsertSource(definition);

  if (definition.url && definition.type !== 'upload') {
    const changed = await sourceChanged(
      source.id,
      definition.url
    );

    if (!changed) {
      console.log(
        `${source.name} unchanged, skipping import`
      );

      return {
        sourceId: source.id,
        status: 'skipped',
      };
    }
  }

  const run = await prisma.importRun.create({
    data: {
      sourceId: source.id,
      status: 'running',
    },
  });

  try {
    const xml = await fetchXmltvSource(definition);
    const parsed = parseXmltv(xml);

    validateXmltv(parsed);

    let channelsCreated = 0;
    let programsCreated = 0;

    const channelMap = new Map();

    const latestStart = await getLatestProgramStart(source.id);

    let programs = parsed.programs;

    if (latestStart) {
      const cutoff = new Date(
        latestStart.getTime() - 48 * 60 * 60 * 1000
      );

      programs = parsed.programs.filter((p) => p.start >= cutoff);

      console.log(
        `Incremental mode: ${programs.length} / ${parsed.programs.length} programmes`
      );
    }

    console.log(
      `Processing ${parsed.channels.length} channels and ${programs.length} programmes`
    );

    for (const channelInput of parsed.channels) {
      const { channel, created } = await findOrCreateChannel(
        channelInput,
        source
      );

      channelMap.set(channelInput.id, channel.id);

      if (created) {
        channelsCreated++;
      }
    }

    console.log(`Channels complete (${channelsCreated} created)`);

    const batch = [];

    for (const program of programs) {
      const channelId = channelMap.get(program.channel);

      if (!channelId) {
        continue;
      }

      const programChecksum = checksum({
        title: program.title,
        subtitle: program.subtitle,
        description: program.description,
        category: program.category,
      });

      batch.push({
        channelId,
        title: program.title,
        subtitle: program.subtitle,
        description: program.description,
        category: program.category,
        start: program.start,
        stop: program.stop,
        sourceId: source.id,
        checksum: programChecksum,
      });
    }

    console.log(`Prepared ${batch.length} programme rows`);

    const CHUNK_SIZE = 5000;

    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);

      const result = await prisma.program.createMany({
        data: chunk,
        skipDuplicates: true,
      });

      programsCreated += result.count;

      console.log(
        `Imported ${Math.min(i + CHUNK_SIZE, batch.length)} / ${batch.length} programmes`
      );
    }

    await prisma.source.update({
      where: {
        id: source.id,
      },
      data: {
        lastRunAt: new Date(),
      },
    });

    await prisma.sourceHealth.create({
      data: {
        sourceId: source.id,
        status: 'success',
        message: `Channels: ${parsed.channels.length}, Programs: ${programs.length}`,
      },
    });

    return prisma.importRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: 'success',
        channelsSeen: parsed.channels.length,
        programsSeen: programs.length,
        channelsCreated,
        programsCreated,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('IMPORT ERROR:', error);

    await recordSourceFailure(
      source,
      error instanceof Error ? error.message : String(error)
    );

    return prisma.importRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: 'failed',
        errors:
          error instanceof Error
            ? `${error.message}\n${error.stack ?? ''}`
            : String(error),
        finishedAt: new Date(),
      },
    });
  }
}
