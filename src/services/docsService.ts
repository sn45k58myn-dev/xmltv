import { appInfo } from '../config/appInfo';

export function buildApiDocs() {
  return {
    name: appInfo.name,
    version: appInfo.version,
    description: appInfo.description,
    generatedAt: new Date().toISOString(),
    authentication: {
      admin: 'Send x-admin-token for /api/admin, /api/sources, /api/export-tokens, and debug routes.',
      exports: 'Set PUBLIC_EXPORTS=true or pass ?token=<export-token> for protected feeds.'
    },
    endpoints: [
      { method: 'GET', path: '/health', description: 'Basic health check.' },
      { method: 'GET', path: '/api/docs', description: 'Machine-readable endpoint catalogue.' },
      { method: 'GET', path: '/manifest.json', description: 'Public feed manifest.' },
      { method: 'GET', path: '/api/discovery/manifest', description: 'Feed discovery manifest.' },
      { method: 'GET', path: '/api/discovery/countries', description: 'Available country feeds.' },
      { method: 'GET', path: '/api/discovery/providers', description: 'Provider feed discovery from mappings.' },
      { method: 'GET', path: '/api/discovery/metadata', description: 'Cache and feed metadata.' },
      { method: 'GET', path: '/api/discovery/validation', description: 'Cached feed validation summary.' },
      { method: 'GET', path: '/country/:country.xml', description: 'Cached country XMLTV feed.' },
      { method: 'GET', path: '/country/:country.xml.gz', description: 'Cached compressed country XMLTV feed.' },
      { method: 'GET', path: '/sports.xml', description: 'Dynamic sports category XMLTV feed.' },
      { method: 'GET', path: '/movies.xml', description: 'Dynamic movies category XMLTV feed.' },
      { method: 'GET', path: '/profile/:id.xml', description: 'Dynamic export profile XMLTV feed.' },
      { method: 'GET', path: '/provider/:id.xml', description: 'Dynamic provider XMLTV feed.' },
      { method: 'GET', path: '/api/stats/dashboard', description: 'Dashboard analytics summary.' },
      { method: 'GET', path: '/api/admin/analytics', description: 'Admin analytics summary.' },
      { method: 'GET', path: '/api/admin/validation', description: 'Admin feed validation details.' },
      { method: 'GET', path: '/api/admin/metadata', description: 'Admin feed metadata details.' }
    ]
  };
}
