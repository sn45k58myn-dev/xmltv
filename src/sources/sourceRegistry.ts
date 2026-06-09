import { customXmltvUrls } from '../config/env';
import { SourceDefinition } from '../models/xmltv';

export const builtInSources: SourceDefinition[] = [
  {
    name: 'epg.pw UK',
    type: 'epg.pw',
    url: 'https://epg.pw/xmltv/epg_GB.xml',
    priority: 10
  }
];

export function getConfiguredSources(): SourceDefinition[] {
  return [
    ...builtInSources,
    ...customXmltvUrls.map((url, index) => ({
      name: `Custom XMLTV URL ${index + 1}`,
      type: 'custom-url' as const,
      url,
      priority: 50
    }))
  ];
}