import { describe, expect, it } from 'vitest';
import { maskExportToken, maskSecret } from './auditLog';

describe('auditLog helpers', () => {
  it('masks token values without returning the full secret', () => {
    expect(maskSecret('abcdef1234567890')).toBe('abcdef...7890');
    expect(maskSecret('short')).toBe('sh...rt');
  });

  it('removes token from export token list objects', () => {
    const masked = maskExportToken({
      id: 'token-1',
      token: 'abcdef1234567890',
      name: 'Main token'
    });

    expect(masked).toEqual({
      id: 'token-1',
      name: 'Main token',
      tokenPreview: 'abcdef...7890'
    });
    expect('token' in masked).toBe(false);
  });
});
