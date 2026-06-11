export function getConfiguredSources() {
  return [
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
}