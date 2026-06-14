import { XMLParser } from 'fast-xml-parser';
import { ParsedXmltv, XmltvChannel, XmltvProgram } from '../models/xmltv';
import { arrayify } from '../utils/normalize';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

function parseXmltvDate(value: string): Date {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!match) return new Date(value);
  const [, y, mo, d, h, mi, s, tz] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${tz ? tz.slice(0, 3) + ':' + tz.slice(3) : 'Z'}`;
  return new Date(iso);
}

function validProgrammeWindow(
  start: Date,
  stop: Date
) {
  return !Number.isNaN(start.valueOf()) &&
    !Number.isNaN(stop.valueOf()) &&
    stop > start;
}

function text(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && '#text' in value) return text(value['#text']);
  return undefined;
}

function firstValue(values: any) {
  return text(Array.isArray(values) ? values[0] : values);
}

export function parseXmltv(xml: string): ParsedXmltv {
  const doc = parser.parse(xml);
  if (!doc.tv) throw new Error('Invalid XMLTV: missing <tv> root');

  const channels: XmltvChannel[] = arrayify<any>(doc.tv.channel).flatMap((channel) => {
    const id = text(channel['@_id']);

    if (!id) {
      return [];
    }

    const displayNames = arrayify<any>(channel['display-name']).map(text).filter(Boolean) as string[];
    const icon = Array.isArray(channel.icon) ? channel.icon[0]?.['@_src'] : channel.icon?.['@_src'];

    return [{
      id,
      displayName: displayNames[0] ?? id,
      aliases: displayNames.slice(1),
      country: text(channel['@_country']),
      category: firstValue(channel.category),
      icon
    }];
  });

  const programs: XmltvProgram[] = arrayify<any>(doc.tv.programme).flatMap((program) => {
    if (!program['@_channel'] || !program['@_start'] || !program['@_stop']) return [];
    const start = parseXmltvDate(String(program['@_start']));
    const stop = parseXmltvDate(String(program['@_stop']));

    if (!validProgrammeWindow(
      start,
      stop
    )) {
      return [];
    }

    const categories = arrayify<any>(program.category)
      .map(text)
      .filter(Boolean) as string[];

    return [{
      channel: String(program['@_channel']),
      title: firstValue(program.title) ?? 'Untitled',
      subtitle: firstValue(program['sub-title']),
      description: firstValue(program.desc),
      category: categories.length ? Array.from(new Set(categories)).join(', ') : undefined,
      start,
      stop
    }];
  });

  return { channels, programs };
}
