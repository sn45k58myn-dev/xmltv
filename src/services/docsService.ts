import { appInfo } from '../config/appInfo';

export function buildApiDocs() {
  return {
    name: appInfo.name,
    version: appInfo.version,
    description: appInfo.description,
    generatedAt: new Date().toISOString(),
    authentication: {
      admin: 'Send x-admin-token or an admin role x-api-key for /api/admin, /api/sources, /api/export-tokens, /imports/upload, /profiles, and debug routes.',
      apiKeys: 'API keys may also be sent as Authorization: Bearer <api-key>. API key secrets are shown once at creation and then stored as SHA-256 hashes.',
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
      { method: 'POST', path: '/api/admin/imports/run', description: 'Admin manual import trigger. Runs inline by default or enqueues when IMPORT_RUN_MODE=queue.' },
      { method: 'GET', path: '/api/admin/jobs', description: 'Admin job run history.' },
      { method: 'GET', path: '/api/admin/jobs/:id', description: 'Admin job run details.' },
      { method: 'GET', path: '/api/admin/queue', description: 'Admin queued job history for queued import workers.' },
      { method: 'GET', path: '/api/admin/audit', description: 'Admin audit log for source, import, profile, token, and channel mapping changes.' },
      { method: 'GET', path: '/api/admin/api-keys', description: 'Admin API key listing with masked key previews.' },
      { method: 'POST', path: '/api/admin/api-keys', description: 'Create an admin/operator/viewer API key. The raw key is returned only once.' },
      { method: 'DELETE', path: '/api/admin/api-keys/:id', description: 'Deactivate an API key.' },
      { method: 'GET', path: '/api/admin/validation', description: 'Admin full feed validation details. Parses cached XML feeds and may be expensive.' },
      { method: 'GET', path: '/api/admin/quality', description: 'Admin feed quality details.' },
      { method: 'GET', path: '/api/admin/quality?snapshot=true', description: 'Admin feed quality details and persist a quality snapshot.' },
      { method: 'GET', path: '/api/admin/quality/history', description: 'Admin feed quality snapshot history.' },
      { method: 'GET', path: '/api/admin/metadata', description: 'Admin feed metadata details.' }
    ]
  };
}
