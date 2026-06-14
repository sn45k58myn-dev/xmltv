import { describe, expect, it } from 'vitest';
import { normalizeName } from './normalize';

describe('normalizeName', () => {
  it('normalizes provider country suffix variants to the same key', () => {
    expect(normalizeName('13th Street')).toBe('13th-street');
    expect(normalizeName('13th Street.pl')).toBe('13th-street');
    expect(normalizeName('13th.Street.pl')).toBe('13th-street');
    expect(normalizeName('13TH STREET.de')).toBe('13th-street');
  });

  it('keeps meaningful channel qualifiers', () => {
    expect(normalizeName('13th Street Universal')).toBe('13th-street-universal');
    expect(normalizeName('13TH STREET (Sky).de')).toBe('13th-street-sky');
  });

  it('removes common quality suffixes', () => {
    expect(normalizeName('BBC News HD')).toBe('bbc-news');
    expect(normalizeName('Sky Cinema UHD')).toBe('sky-cinema');
  });
});
