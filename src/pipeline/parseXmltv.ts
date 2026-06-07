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

function text(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && '#text' in value) return String(value['#text']);
  return undefined;
}

export function parseXmltv(xml: string): ParsedXmltv {
  const doc = parser.parse(xml);
  if (!doc.tv) throw new Error('Invalid XMLTV: missing <tv> root');

  const channels: XmltvChannel[] = arrayify<any>(doc.tv.channel).map((channel) => {
    const displayNames = arrayify<any>(channel['display-name']).map(text).filter(Boolean) as string[];
    const icon = Array.isArray(channel.icon) ? channel.icon[0]?.['@_src'] : channel.icon?.['@_src'];
    return {
      id: String(channel['@_id']),
      displayName: displayNames[0] ?? String(channel['@_id']),
      aliases: displayNames.slice(1),
      icon
    };
  });

  const programs: XmltvProgram[] = arrayify<any>(doc.tv.programme).flatMap((program) => {
    if (!program['@_channel'] || !program['@_start'] || !program['@_stop']) return [];
    return [{
      channel: String(program['@_channel']),
      title: text(Array.isArray(program.title) ? program.title[0] : program.title) ?? 'Untitled',
      subtitle: text(Array.isArray(program['sub-title']) ? program['sub-title'][0] : program['sub-title']),
      description: text(Array.isArray(program.desc) ? program.desc[0] : program.desc),
      category: text(Array.isArray(program.category) ? program.category[0] : program.category),
      start: parseXmltvDate(String(program['@_start'])),
      stop: parseXmltvDate(String(program['@_stop']))
    }];
  });

  return { channels, programs };
}
