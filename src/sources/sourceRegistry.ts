import { customXmltvUrls } from '../config/env';
import { SourceDefinition } from '../models/xmltv';

export const builtInSources: SourceDefinition[] = [
  { name: 'epg.pw UK', type: 'epg.pw', url: 'https://epg.pw/xmltv/epg_GB.xml', priority: 10 },
  { name: 'epg.pw US', type: 'epg.pw', url: 'https://epg.pw/xmltv/epg_US.xml', priority: 10 },
  { name: 'IPTV-Org UK', type: 'iptv-org', url: 'https://iptv-org.github.io/epg/guides/uk.xml', priority: 20 },
  { name: 'IPTV-Org US', type: 'iptv-org', url: 'https://iptv-org.github.io/epg/guides/us.xml', priority: 20 },
  { name: 'Schedules Direct', type: 'schedules-direct', priority: 5 }
];

export function getConfiguredSources(): SourceDefinition[] {
  return [
    ...builtInSources,
    ...customXmltvUrls.map((url, index) => ({ name: `Custom XMLTV URL ${index + 1}`, type: 'custom-url' as const, url, priority: 50 }))
  ];
}
