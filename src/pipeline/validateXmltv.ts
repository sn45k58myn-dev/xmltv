import { ParsedXmltv } from '../models/xmltv';

export function validateXmltv(parsed: ParsedXmltv): void {
  if (!parsed.channels.length) throw new Error('XMLTV validation failed: no channels found');
  const channelIds = new Set<string>();

  for (const channel of parsed.channels) {
    if (channelIds.has(channel.id)) {
      throw new Error(`XMLTV validation failed: duplicate channel id ${channel.id}`);
    }

    channelIds.add(channel.id);
  }

  const orphan = parsed.programs.find((p) => !channelIds.has(p.channel));
  if (orphan) throw new Error(`XMLTV validation failed: programme references unknown channel ${orphan.channel}`);
  const badDate = parsed.programs.find((p) => Number.isNaN(p.start.valueOf()) || Number.isNaN(p.stop.valueOf()) || p.stop <= p.start);
  if (badDate) throw new Error(`XMLTV validation failed: bad programme date on ${badDate.channel}`);
}
