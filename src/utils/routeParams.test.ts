import { describe, expect, it } from 'vitest';
import { normalizeCountryParam, safeRouteId } from './routeParams';

describe('routeParams', () => {
  it('normalizes country route params', () => {
    expect(normalizeCountryParam('uk')).toBe('GB');
    expect(normalizeCountryParam('us')).toBe('US');
  });

  it('rejects invalid country params', () => {
    expect(() => normalizeCountryParam('../GB')).toThrow('Invalid country code');
    expect(() => normalizeCountryParam('GBR1')).toThrow('Invalid country code');
  });

  it('accepts safe ids and rejects unsafe route ids', () => {
    expect(safeRouteId('provider_1.test')).toBe('provider_1.test');
    expect(() => safeRouteId('../provider')).toThrow('Invalid route id');
    expect(() => safeRouteId('provider/id')).toThrow('Invalid route id');
  });
});
