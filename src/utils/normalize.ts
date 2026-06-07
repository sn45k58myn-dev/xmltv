import crypto from 'node:crypto';
import slugify from 'slugify';

export function normalizeName(value: string): string {
  return slugify(value, { lower: true, strict: true })
    .replace(/\bhd\b|\bfhd\b|\buhd\b|\bsd\b/g, '')
    .replace(/\buk\b|\bus\b/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function checksum(value: unknown): string {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

export function arrayify<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
