import { z } from 'zod';

const nullableString = z.string().trim().nullable().optional();
const optionalString = z.string().trim().optional();
const safeRouteIdPattern = /^[A-Za-z0-9_.-]+$/;
const scopedRouteId = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().regex(safeRouteIdPattern, 'Must be a safe route id.').nullable().optional()
);

function onlyOneScope<T extends z.AnyZodObject>(schema: T) {
  return schema.superRefine((value: z.infer<T>, ctx) => {
    if (value.profileId && value.providerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose either profileId or providerId, not both.',
        path: ['providerId']
      });
    }
  });
}

export const sourceCreateSchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  url: nullableString,
  priority: z.coerce.number().int().optional(),
  mergeWeight: z.coerce.number().int().optional(),
  enabled: z.boolean().optional()
}).strict();

export const sourceUpdateSchema = sourceCreateSchema.partial();

export const profileCreateSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  country: nullableString,
  category: nullableString,
  providerId: nullableString,
  channelIds: nullableString,
  token: nullableString,
  rateLimit: z.coerce.number().int().positive().nullable().optional()
}).strict();

export const profileUpdateSchema = profileCreateSchema.partial();

export const channelUpdateSchema = z.object({
  displayName: optionalString,
  country: nullableString,
  category: nullableString,
  icon: nullableString,
  logo: nullableString,
  image: nullableString,
  tmdbId: nullableString,
  seriesId: nullableString
}).strict();

export const aliasCreateSchema = z.object({
  channelId: z.string().trim().min(1),
  value: z.string().trim().min(1),
  normalized: z.string().trim().min(1)
}).strict();

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1),
  role: z.enum(['admin', 'operator', 'viewer']).default('viewer')
}).strict();

export const apiKeyUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(['admin', 'operator', 'viewer']).optional(),
  active: z.boolean().optional()
}).strict();

export const channelMergeSchema = z.object({
  targetChannelId: z.string().trim().min(1),
  channelIdsToMerge: z.array(z.string().trim().min(1)).min(1)
}).strict();

export const aliasGenerateSchema = z.object({
  channelId: z.string().trim().min(1)
}).strict();

const exportTokenCreateBaseSchema = z.object({
  name: z.string().trim().min(1).optional(),
  profileId: scopedRouteId,
  providerId: scopedRouteId,
  active: z.boolean().optional()
}).strict();

export const exportTokenCreateSchema = onlyOneScope(exportTokenCreateBaseSchema);

export const legacyExportTokenCreateSchema = onlyOneScope(exportTokenCreateBaseSchema.extend({
  token: z.string().trim().min(16)
}).strict());

export const exportTokenUpdateSchema = onlyOneScope(z.object({
  name: z.string().trim().min(1).optional(),
  profileId: scopedRouteId,
  providerId: scopedRouteId,
  active: z.boolean().optional()
}).strict());

export const channelAssetsSchema = z.object({
  logo: nullableString,
  image: nullableString
}).strict();

export const catchupSchema = z.object({
  catchupUrl: z.string().trim().url().nullable().optional(),
  catchupDays: z.coerce.number().int().positive().nullable().optional()
}).strict();

type SourceCreatePayload = {
  name: string;
  type: string;
  url?: string | null;
  priority?: number;
  mergeWeight?: number;
  enabled?: boolean;
};

type ProfileCreatePayload = {
  name: string;
  slug: string;
  country?: string | null;
  category?: string | null;
  providerId?: string | null;
  channelIds?: string | null;
  token?: string | null;
  rateLimit?: number | null;
};

type ApiKeyCreatePayload = {
  name: string;
  role?: 'admin' | 'operator' | 'viewer';
};

export function parseSourceCreatePayload(value: unknown): SourceCreatePayload {
  const parsed = sourceCreateSchema.parse(value);

  return {
    ...parsed,
    name: parsed.name as string,
    type: parsed.type as string
  };
}

export function parseProfileCreatePayload(value: unknown): ProfileCreatePayload {
  const parsed = profileCreateSchema.parse(value);

  return {
    ...parsed,
    name: parsed.name as string,
    slug: parsed.slug as string
  };
}

export function parseApiKeyCreatePayload(value: unknown): ApiKeyCreatePayload {
  const parsed = apiKeyCreateSchema.parse(value);

  return {
    ...parsed,
    name: parsed.name as string
  };
}

export function parseAdminPayload<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown
): T {
  return schema.parse(value);
}

export function parseNonEmptyAdminPayload<T extends Record<string, unknown>>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown
): T {
  const parsed = parseAdminPayload(
    schema,
    value
  );

  if (Object.keys(parsed).length === 0) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one update field is required.'
      }
    ]);
  }

  return parsed;
}
