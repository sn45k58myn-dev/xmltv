import 'dotenv/config';
import { z } from 'zod';

const booleanString = z.enum(['true', 'false']);
const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().nonnegative();

function parseList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const schema = z.object({
  DATABASE_URL: z.string().default('file:./dev.db'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  BASE_URL: z.string().default('http://localhost:3001'),
  SCHEDULES_DIRECT_USERNAME: z.string().optional(),
  SCHEDULES_DIRECT_PASSWORD: z.string().optional(),
  SCHEDULES_DIRECT_COUNTRY: z.string().default('GBR'),
  SCHEDULES_DIRECT_LINEUP: z.string().optional(),
  SCHEDULES_DIRECT_DAYS: positiveInt.default(7),
  SCHEDULES_DIRECT_BASE_URL: z.string().default('https://json.schedulesdirect.org/20141201'),
  CUSTOM_XMLTV_URLS: z.string().optional(),
  WEBGRAB_SOURCE_FILES: z.string().optional(),
  ADMIN_TOKEN: z.string().default('dev-admin-token'),
  ALLOW_ADMIN_QUERY_TOKEN: booleanString.default('false'),
  PUBLIC_EXPORTS: booleanString.default('false'),
  CORS_ORIGIN: z.string().default('*'),
  JSON_BODY_LIMIT: z.string().default('1mb'),
  UPLOAD_MAX_MB: positiveInt.default(200),
  TRUST_PROXY: booleanString.default('false'),
  SOURCE_FETCH_TIMEOUT_MS: positiveInt.default(60000),
  SOURCE_FETCH_MAX_MB: positiveInt.default(1024),
  SOURCE_FETCH_MAX_REDIRECTS: nonNegativeInt.default(0),
  SOURCE_FETCH_RETRIES: nonNegativeInt.default(2),
  SOURCE_RETRY_DELAY_MS: positiveInt.default(1000),
  SOURCE_HEAD_TIMEOUT_MS: positiveInt.default(10000),
  SOURCE_FAILURE_BACKOFF_MINUTES: nonNegativeInt.default(30),
  SOURCE_AUTO_DISABLE_FAILURES: nonNegativeInt.default(0),
  IMPORT_TIMEOUT_MS: positiveInt.default(1800000),
  SCHEDULER_LOCK_TTL_MS: positiveInt.default(3600000),
  IMPORT_RUN_MODE: z.enum(['inline', 'queue']).default('inline'),
  JOB_QUEUE_BACKEND: z.enum(['database', 'bullmq']).default('database'),
  ENABLE_WORKER: booleanString.default('false'),
  WORKER_POLL_MS: positiveInt.default(5000),
  WORKER_LOCK_TTL_MS: positiveInt.default(1800000),
  WORKER_SHUTDOWN_TIMEOUT_MS: positiveInt.default(30000),
  RATE_LIMIT_WINDOW_MS: positiveInt.default(60000),
  RATE_LIMIT_MAX: positiveInt.default(120),
  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().optional(),
  MONITORING_TOKEN: z.string().optional(),
  TMDB_API_KEY: z.string().optional(),
  PREMIUM_ENABLED: booleanString.default('true'),
  PROGRAM_RETENTION_DAYS: positiveInt.default(14),
  AUDIT_LOG_RETENTION_DAYS: positiveInt.default(180),
  JOB_RUN_RETENTION_DAYS: positiveInt.default(90),
  JOB_QUEUE_RETENTION_DAYS: positiveInt.default(30),
  FEED_QUALITY_RETENTION_DAYS: positiveInt.default(180),
  SOURCE_HEALTH_RETENTION_DAYS: positiveInt.default(180),
  FEED_DOWNLOAD_RETENTION_DAYS: positiveInt.default(365),
  EXPORT_PAST_HOURS: nonNegativeInt.default(12),
  EXPORT_FUTURE_DAYS: positiveInt.default(7),
  ENABLE_DEBUG_ROUTES: booleanString.default('false'),
  ENABLE_SCHEDULER: booleanString.default('true'),
  FEED_CACHE_MAX_AGE_SECONDS: nonNegativeInt.default(300),
  CACHE_WARNING_MB: positiveInt.default(1024),
  CACHE_METADATA_STORE: z.enum(['filesystem', 'redis']).default('filesystem'),
  VALIDATION_MAX_FEED_MB: positiveInt.default(250),
  VALIDATION_TIMEOUT_MS: positiveInt.default(30000),
  WEBGRAB_ENABLED: booleanString.default('false'),
  WEBGRAB_COMMAND: z.string().optional(),
  WEBGRAB_WORKDIR: z.string().default('webgrab'),
  WEBGRAB_OUTPUT_FILE: z.string().default('guide.xml'),
  WEBGRAB_SOURCE_NAME: z.string().default('WebGrabPlus'),
  WEBGRAB_SOURCE_PRIORITY: positiveInt.default(90),
  WEBGRAB_SOURCE_MERGE_WEIGHT: positiveInt.default(50),
  WEBGRAB_TIMEOUT_MS: positiveInt.default(3600000),
  WEBGRAB_MAX_OUTPUT_MB: positiveInt.default(1024),
  WEBGRAB_REBUILD_FEEDS: booleanString.default('true')
});

export const env = schema.parse(process.env);

export const customXmltvUrls = parseList(env.CUSTOM_XMLTV_URLS);
export const webgrabSourceFiles = parseList(env.WEBGRAB_SOURCE_FILES);
