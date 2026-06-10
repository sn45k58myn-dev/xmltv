import { Source } from '@prisma/client';
import { prisma } from '../db/prisma';
import { SourceDefinition, XmltvChannel } from '../models/xmltv';
import { fetchXmltvSource } from '../sources/fetchers';
import { checksum, normalizeName } from '../utils/normalize';
import { parseXmltv } from './parseXmltv';
import { validateXmltv } from './validateXmltv';
import { enrichChannel } from '../enrichment/channelMetadata';

async function upsertSource(definition) {
  return prisma.source.upsert({
    where: { name: definition.name },
    create: {
      name: definition.name,
      type: definition.type,
      url: definition.url,
      priority: definition.priority ?? 100
    },
    update: {
      type: definition.type,
      url: definition.url,
      priority: definition.priority ?? 100,
      enabled: true
    }
  });
}

async function findOrCreateChannel(input, source) {
  const normalized = normalizeName(input.displayName);

  const existingById = await prisma.channel.findUnique({
    where: { xmltvId: input.id }
  });

  if (existingById) {
    return { channel: existingById, created: false };
  }

  const alias = await prisma.alias.findFirst({
    where: { normalized }
  });

  if (alias) {
    return {
      channel: await prisma.channel.findUniqueOrThrow({
        where: { id: alias.channelId }
      }),
      created: false
    };
  }

  const similar = await prisma.channel.findFirst({
    where: { normalized }
  });

  if (similar) {
    await prisma.alias.create({
      data: {
        channelId: similar.id,
        value: input.displayName,
        normalized
      }
    }).catch(() => null);

    return { channel: similar, created: false };
  }

  const metadata = enrichChannel(input.displayName);

  const channel = await prisma.channel.create({
    data: {
      xmltvId: input.id,
      displayName: input.displayName,
      normalized,
      country: input.country ?? metadata.country,
      category: input.category ?? metadata.category,
      icon: input.icon,
      sourceRefs: JSON.stringify([{
        sourceId: source.id,
        sourceChannelId: input.id
      }]),
      aliases: {
        create: [
          {
            value: input.displayName,
            normalized
          },
          ...(input.aliases ?? []).map((value) => ({
            value,
            normalized: normalizeName(value)
          }))
        ]
      }
    }
  });

  return { channel, created: true };
}

export async function runImport(definition) {
  const source = await upsertSource(definition);

  const run = await prisma.importRun.create({
    data: {
      sourceId: source.id,
      status: 'running'
    }
  });

  try {
    const xml = await fetchXmltvSource(definition);
    const parsed = parseXmltv(xml);

    validateXmltv(parsed);

    let channelsCreated = 0;
    let programsCreated = 0;

    const channelMap = new Map();

    for (const channelInput of parsed.channels) {
      const { channel, created } = await findOrCreateChannel(channelInput, source);

      channelMap.set(channelInput.id, channel.id);

      if (created) {
        channelsCreated++;
      }
    }

    for (const program of parsed.programs) {
      const channelId = channelMap.get(program.channel);

      if (!channelId) {
        continue;
      }

      const programChecksum = checksum({
        title: program.title,
        subtitle: program.subtitle,
        description: program.description,
        category: program.category
      });

      try {
        await prisma.program.create({
          data: {
            channelId,
            title: program.title,
            subtitle: program.subtitle,
            description: program.description,
            category: program.category,
            start: program.start,
            stop: program.stop,
            sourceId: source.id,
            checksum: programChecksum
          }
        });

        programsCreated++;
      } catch (error) {
        if (error?.code !== 'P2002') {
          throw error;
        }
      }
    }

    await prisma.source.update({
      where: { id: source.id },
      data: {
        lastRunAt: new Date()
      }
    });
    await prisma.sourceHealth.create({
      data: {
        sourceId: source.id,
        status: 'success',
        message: `Channels: ${parsed.channels.length}, Programs: ${parsed.programs.length}`
      }
    });
    return prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        channelsSeen: parsed.channels.length,
        programsSeen: parsed.programs.length,
        channelsCreated,
        programsCreated,
        finishedAt: new Date()
      }
    });
  } catch (error) {
    console.error('IMPORT ERROR:', error);
    
    await prisma.sourceHealth.create({
      data: {
        sourceId: source.id,
        status: 'failed',
        message:
          error instanceof Error
            ? error.message
            : String(error)
      }
    });
    return prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        errors:
          error instanceof Error
            ? `${error.message}\n${error.stack ?? ''}`
            : String(error),
        finishedAt: new Date()
      }
    });
  }
}
