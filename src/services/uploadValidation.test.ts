import { describe, expect, it } from 'vitest';
import { safeUploadDisplayName } from './uploadValidation';

describe('uploadValidation', () => {
  it('sanitizes uploaded filenames for import labels', () => {
    const sanitized = safeUploadDisplayName('../bad\nname<script>.xml');

    expect(sanitized).toBe('badname_script_.xml');
  });

  it('uses a fallback name when the uploaded filename is empty after sanitizing', () => {
    expect(safeUploadDisplayName('\n\t')).toBe('upload.xml');
  });
});
