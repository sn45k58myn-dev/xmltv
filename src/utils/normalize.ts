import crypto from 'node:crypto';
import slugify from 'slugify';

const countrySuffixCodes = [
  'ae',
  'al',
  'ar',
  'at',
  'au',
  'be',
  'br',
  'ca',
  'ch',
  'de',
  'dk',
  'es',
  'fi',
  'fr',
  'gb',
  'ie',
  'in',
  'it',
  'jp',
  'kr',
  'mx',
  'nl',
  'no',
  'nz',
  'pl',
  'pt',
  'se',
  'uk',
  'us'
];

export function normalizeName(value: string): string {
  const countrySuffixPattern = new RegExp(`-(${countrySuffixCodes.join('|')})$`);

  return slugify(value.replace(/[._]+/g, ' '), { lower: true, strict: true })
    .replace(/\bhd\b|\bfhd\b|\buhd\b|\bsd\b/g, '')
    .replace(/\buk\b|\bus\b/g, '')
    .replace(countrySuffixPattern, '')
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
