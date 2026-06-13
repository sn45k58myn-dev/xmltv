import { describe, expect, it } from 'vitest';
import { sanitizeRequestPath } from './requestContext';

describe('sanitizeRequestPath', () => {
  it('leaves paths without query strings unchanged', () => {
    expect(sanitizeRequestPath('/health')).toBe('/health');
  });

  it('redacts export tokens while preserving diagnostic query params', () => {
    expect(sanitizeRequestPath('/country/GB.xml?token=secret&format=xml')).toBe(
      '/country/GB.xml?token=REDACTED&format=xml'
    );
  });

  it('redacts admin and API credentials in query strings', () => {
    expect(
      sanitizeRequestPath('/api/admin/summary?adminToken=secret&apiKey=abc')
    ).toBe('/api/admin/summary?adminToken=REDACTED&apiKey=REDACTED');
  });
});
