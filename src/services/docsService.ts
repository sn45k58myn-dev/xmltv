import { appInfo } from '../config/appInfo';

export function buildApiDocs() {
  return {
    name: appInfo.name,
    version: appInfo.version,
    description: appInfo.description,
    generatedAt: new Date().toISOString(),
    authentication: {
      admin: 'Send x-admin-token for /api/admin, /api/sources, /api/export-tokens, /imports/upload, /profiles, and debug routes.',
      exports: 'Protected feeds require PUBLIC_EXPORTS=true, ?token=<export-token>, or x-export-token.'
    },
    endpoints: [
      { method: 'GET', path: '/health', description: 'Basic health check.' },
      { method: 'GET', path: '/ready', description: 'Readiness check with database probe.' },
      { method: 'GET', path: '/api/docs', description: 'Machine-readable endpoint catalogue.' },
      { method: 'GET', path: '/manifest.json', description: 'Public feed manifest.' },
      { method: 'GET', path: '/api/discovery/manifest', description: 'Feed discovery manifest.' },
      { method: 'GET', path: '/api/discovery/countries', description: 'Available country feeds.' },
      { method: 'GET', path: '/api/discovery/providers', description: 'Provider feed discovery from mappings.' },
      { method: 'GET', path: '/api/discovery/metadata', description: 'Cache and feed metadata.' },
      { method: 'GET', path: '/api/discovery/validation', description: 'Lightweight public cached feed validation summary. Full validation is admin-only.' },
      { method: 'GET', path: '/api/discovery/quality', description: 'Cached feed quality scores.' },
      { method: 'GET', path: '/country/:country.xml', description: 'Cached country XMLTV feed.' },
      { method: 'GET', path: '/country/:country.xml.gz', description: 'Cached compressed country XMLTV feed.' },
      { method: 'GET', path: '/sports.xml', description: 'Dynamic sports category XMLTV feed.' },
      { method: 'GET', path: '/movies.xml', description: 'Dynamic movies category XMLTV feed.' },
      { method: 'GET', path: '/profile/:id.xml', description: 'Dynamic export profile XMLTV feed.' },
      { method: 'GET', path: '/provider/:id.xml', description: 'Dynamic provider XMLTV feed.' },
      { method: 'GET', path: '/provider/:id.xml.gz', description: 'Cached compressed provider XMLTV feed.' },
      { method: 'POST', path: '/imports/upload', description: 'Admin-protected XMLTV upload. Requires x-admin-token.' },
      { method: 'POST', path: '/profiles', description: 'Admin-protected export profile creation. Requires x-admin-token.' },
      { method: 'GET', path: '/api/stats/dashboard', description: 'Dashboard analytics summary.' },
      { method: 'GET', path: '/api/admin/analytics', description: 'Admin analytics summary.' },
      { method: 'GET', path: '/api/admin/jobs', description: 'Admin job run history.' },
      { method: 'GET', path: '/api/admin/jobs/:id', description: 'Admin job run details.' },
      { method: 'GET', path: '/api/admin/validation', description: 'Admin full feed validation details. Parses cached XML feeds and may be expensive.' },
      { method: 'GET', path: '/api/admin/quality', description: 'Admin feed quality details.' },
      { method: 'GET', path: '/api/admin/metadata', description: 'Admin feed metadata details.' }
    ]
  };
}
