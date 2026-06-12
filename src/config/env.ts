import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().default('file:./dev.db'),
  PORT: z.coerce.number().default(3001),
  BASE_URL: z.string().default('http://localhost:3001'),
  SCHEDULES_DIRECT_USERNAME: z.string().optional(),
  SCHEDULES_DIRECT_PASSWORD: z.string().optional(),
  SCHEDULES_DIRECT_COUNTRY: z.string().default('GBR'),
  SCHEDULES_DIRECT_LINEUP: z.string().optional(),
  CUSTOM_XMLTV_URLS: z.string().optional(),
  ADMIN_TOKEN: z.string().default('dev-admin-token'),
  PUBLIC_EXPORTS: z.string().default('false'),
  CORS_ORIGIN: z.string().default('*'),
  JSON_BODY_LIMIT: z.string().default('1mb'),
  UPLOAD_MAX_MB: z.coerce.number().default(200),
  TRUST_PROXY: z.string().default('false'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  TMDB_API_KEY: z.string().optional(),
  PREMIUM_ENABLED: z.string().default('true'),
  PROGRAM_RETENTION_DAYS: z.coerce.number().default(14),
  EXPORT_PAST_HOURS: z.coerce.number().default(12),
  EXPORT_FUTURE_DAYS: z.coerce.number().default(7),
  ENABLE_DEBUG_ROUTES: z.string().default('false')
});

export const env = schema.parse(process.env);

export const customXmltvUrls = (env.CUSTOM_XMLTV_URLS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
