import { env } from '../config/env';
import { SourceDefinition } from '../models/xmltv';

export function getConfiguredSources() {
  const sources: SourceDefinition[] = [
    {
      name: 'epg.pw UK',
      type: 'epg.pw',
      url: 'https://epg.pw/xmltv/epg_GB.xml',
      priority: 10
    },
    {
      name: 'epg.pw US',
      type: 'epg.pw',
      url: 'https://epg.pw/xmltv/epg_US.xml',
      priority: 10
    }
  ];

  if (env.SCHEDULES_DIRECT_USERNAME && env.SCHEDULES_DIRECT_PASSWORD) {
    sources.push({
      name: 'Schedules Direct',
      type: 'schedules-direct',
      priority: 20
    });
  }

  return sources;
}
