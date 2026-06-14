import { describe, expect, it } from 'vitest';
import {
  exportTokenCreateSchema,
  exportTokenUpdateSchema,
  legacyExportTokenCreateSchema
} from './adminPayloads';

describe('admin payload schemas', () => {
  it('allows unscoped or singly-scoped export tokens', () => {
    expect(exportTokenCreateSchema.parse({
      name: 'General'
    })).toEqual({
      name: 'General'
    });
    expect(exportTokenCreateSchema.parse({
      name: 'Provider',
      providerId: 'jellyextreme'
    })).toMatchObject({
      providerId: 'jellyextreme'
    });
    expect(exportTokenUpdateSchema.parse({
      profileId: ''
    })).toEqual({
      profileId: null
    });
  });

  it('rejects ambiguous export token scopes', () => {
    expect(() => exportTokenCreateSchema.parse({
      profileId: 'profile-1',
      providerId: 'provider-1'
    })).toThrow('Choose either profileId or providerId');
  });

  it('rejects unsafe export token scope ids', () => {
    expect(() => exportTokenUpdateSchema.parse({
      providerId: '../provider'
    })).toThrow('Must be a safe route id');
  });

  it('keeps legacy token creation scope validation', () => {
    expect(() => legacyExportTokenCreateSchema.parse({
      token: '1234567890123456',
      providerId: 'provider/id'
    })).toThrow('Must be a safe route id');
  });
});
