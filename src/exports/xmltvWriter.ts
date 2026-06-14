import { Program, Channel, Alias } from '@prisma/client';

function esc(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmltvDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())} +0000`;
}

function validProgrammeWindow(program: Program) {
  return (
    program.start instanceof Date &&
    program.stop instanceof Date &&
    !Number.isNaN(program.start.valueOf()) &&
    !Number.isNaN(program.stop.valueOf()) &&
    program.stop > program.start
  );
}

function belongsToChannel(
  program: Program,
  channel: Channel
) {
  return !program.channelId || program.channelId === channel.id;
}

type ChannelWithPrograms = Channel & {
  aliases?: Alias[];
  programs: Program[];
};

export function writeXmltv(channels: ChannelWithPrograms[]): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="xmltv-aggregator">'];
  for (const channel of channels) {
    out.push(`  <channel id="${esc(channel.xmltvId)}">`);
    out.push(`    <display-name>${esc(channel.displayName)}</display-name>`);
    const names = new Set([channel.displayName.toLowerCase()]);
    for (const alias of channel.aliases ?? []) {
      const normalized = alias.value.toLowerCase();

      if (!names.has(normalized)) {
        out.push(`    <display-name>${esc(alias.value)}</display-name>`);
        names.add(normalized);
      }
    }
    const icon = channel.logo ?? channel.icon ?? channel.image;
    if (icon) out.push(`    <icon src="${esc(icon)}" />`);
    out.push('  </channel>');
  }
  for (const channel of channels) {
    for (const program of channel.programs) {
      if (!belongsToChannel(
        program,
        channel
      ) || !validProgrammeWindow(program)) {
        continue;
      }

      out.push(`  <programme start="${xmltvDate(program.start)}" stop="${xmltvDate(program.stop)}" channel="${esc(channel.xmltvId)}">`);
      out.push(`    <title>${esc(program.title)}</title>`);
      if (program.subtitle) out.push(`    <sub-title>${esc(program.subtitle)}</sub-title>`);
      if (program.description) out.push(`    <desc>${esc(program.description)}</desc>`);
      if (program.category) out.push(`    <category>${esc(program.category)}</category>`);
      if ((program as any).image) out.push(`    <icon src="${esc((program as any).image)}" />`);
      if ((program as any).episodeNum) out.push(`    <episode-num system="xmltv_ns">${esc((program as any).episodeNum)}</episode-num>`);
      if ((program as any).catchupUrl) out.push(`    <url>${esc((program as any).catchupUrl)}</url>`);
      out.push('  </programme>');
    }
  }
  out.push('</tv>');
  return out.join('\n');
}
