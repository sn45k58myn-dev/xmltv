import { Source } from '@prisma/client';
import { prisma } from '../db/prisma';
import { SourceDefinition, XmltvChannel } from '../models/xmltv';
import { fetchXmltvSource } from '../sources/fetchers';
import { checksum, normalizeName } from '../utils/normalize';
import { parseXmltv } from './parseXmltv';
import { validateXmltv } from './validateXmltv';

async function upsertSource(definition: SourceDefinition): Promise<Source> {
  return prisma.source.upsert({
    where: { name: definition.name },
    create: { name: definition.name, type: definition.type, url: definition.url, priority: definition.priority ?? 100 },
    update: { type: definition.type, url: definition.url, priority: definition.priority ?? 100, enabled: true }
  });
}

async function findOrCreateChannel(input: XmltvChannel, source: Source) {
  const normalized = normalizeName(input.displayName);
  const existingById = await prisma.channel.findUnique({ where: { xmltvId: input.id } });
  if (existingById) return { channel: existingById, created: false };

  const alias = await prisma.alias.findFirst({ where: { normalized } });
  if (alias) return { channel: await prisma.channel.findUniqueOrThrow({ where: { id: alias.channelId } }), created: false };

  const similar = await prisma.channel.findFirst({ where: { normalized } });
  if (similar) {
    await prisma.alias.create({ data: { channelId: similar.id, value: input.displayName, normalized } }).catch(() => null);
    return { channel: similar, created: false };
  }

  const channel = await prisma.channel.create({
    data: {
      xmltvId: input.id,
      displayName: input.displayName,
      normalized,
      country: input.country,
      category: input.category,
      icon: input.icon,
      sourceRefs: JSON.stringify([{ sourceId: source.id, sourceChannelId: input.id }]),
      aliases: { create: [{ value: input.displayName, normalized }, ...(input.aliases ?? []).map((value) => ({ value, normalized: normalizeName(value) }))] }
    }
  });
  return { channel, created: true };
}

export async function runImport(definition: SourceDefinition) {
  const source = await upsertSource(definition);
  const run = await prisma.importRun.create({ data: { sourceId: source.id, status: 'running' } });
  try {
    const xml = await fetchXmltvSource(definition);
    const parsed = parseXmltv(xml);
    validateXmltv(parsed);

    let channelsCreated = 0;
    let programsCreated = 0;
    const channelMap = new Map<string, string>();

    for (const channelInput of parsed.channels) {
      const { channel, created } = await findOrCreateChannel(channelInput, source);
      channelMap.set(channelInput.id, channel.id);
      if (created) channelsCreated++;
    }

    for (const program of parsed.programs) {
      const channelId = channelMap.get(program.channel);
      if (!channelId) continue;
      const programChecksum = checksum({ title: program.title, subtitle: program.subtitle, description: program.description, category: program.category });
     const result = await prisma.program.createMany({
  data: [{
    channelId,
    title: program.title,
    subtitle: program.subtitle,
    description: program.description,
    category: program.category,
    start: program.start,
    stop: program.stop,
    sourceId: source.id,
    checksum: programChecksum
   }]
    });

      programsCreated += result.count;
    }

    await prisma.source.update({ where: { id: source.id }, data: { lastRunAt: new Date() } });
    return prisma.importRun.update({
      where: { id: run.id },
      data: { status: 'success', channelsSeen: parsed.channels.length, programsSeen: parsed.programs.length, channelsCreated, programsCreated, finishedAt: new Date() }
    });
  } catch (error) {
    return prisma.importRun.update({ where: { id: run.id }, data: { status: 'failed', errors: error instanceof Error ? error.message : String(error), finishedAt: new Date() } });
  }
}
