import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceChanged } from './sourceChanged';

vi.mock('axios', () => ({
  default: {
    head: vi.fn()
  }
}));

vi.mock('../config/env', () => ({
  env: {
    SOURCE_HEAD_TIMEOUT_MS: 10000,
    SOURCE_FETCH_MAX_REDIRECTS: 0
  }
}));

vi.mock('./sourceCache', () => ({
  getSourceCache: vi.fn().mockResolvedValue(null),
  updateSourceCache: vi.fn()
}));

vi.mock('../sources/sourceUrl', () => ({
  assertResolvedSourceUrlAllowed: vi.fn().mockResolvedValue(undefined)
}));

describe('sourceChanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables redirects for source freshness checks', async () => {
    vi.mocked(axios.head).mockResolvedValue({
      status: 200,
      headers: {
        etag: '"abc"'
      }
    });

    await expect(sourceChanged('source-1', 'https://example.com/guide.xml')).resolves.toBe(true);

    expect(axios.head).toHaveBeenCalledWith(
      'https://example.com/guide.xml',
      expect.objectContaining({
        timeout: 10000,
        maxRedirects: 0
      })
    );
  });
});
