
import { prisma } from '../db/prisma';
import { normalizeName } from '../utils/normalize';

const suffixes = ['hd', 'fhd', 'uhd', '4k', 'plus', '+1', 'uk', 'us'];

export function generateAliasCandidates(name: string): string[] {
  const base = name.replace(/\s+/g, ' ').trim();
  const stripped = base.replace(/\b(HD|FHD|UHD|4K|UK|US)\b/gi, '').replace(/\s+/g, ' ').trim();
  return Array.from(new Set([
    base,
    stripped,
    base.replace(/\+/g, ' Plus'),
    base.replace(/ and /gi, ' & '),
    base.replace(/ & /g, ' and '),
    ...suffixes.map((s) => `${stripped} ${s.toUpperCase()}`)
  ].filter(Boolean)));
}

export async function autoGenerateAliases(channelId?: string) {
  const channels = await prisma.channel.findMany({ where: channelId ? { id: channelId } : undefined });
  let created = 0;
  for (const channel of channels) {
    for (const value of generateAliasCandidates(channel.displayName)) {
      await prisma.alias.create({ data: { channelId: channel.id, value, normalized: normalizeName(value) } })
        .then(() => created++)
        .catch(() => null);
    }
  }
  return { channels: channels.length, aliasesCreated: created };
}
