import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSourceCache, updateSourceCache } from './sourceCache';
import { sourceChanged } from './sourceChanged';

vi.mock('axios', () => ({
  default: {
    head: vi.fn()
  }
}));

vi.mock('../config/env', () => ({
  env: {
    SOURCE_HEAD_TIMEOUT_MS: 10000,
    SOURCE_FETCH_MAX_REDIRECTS: 1
  }
}));

vi.mock('./sourceCache', () => ({
  getSourceCache: vi.fn().mockResolvedValue(null),
  updateSourceCache: vi.fn()
}));

vi.mock('../sources/sourceUrl', () => ({
  assertResolvedSourceUrlAllowed: vi.fn().mockResolvedValue(undefined),
  resolveSourceRedirectUrl: vi.fn().mockReturnValue(new URL('https://cdn.example.com/guide.xml'))
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

  it('validates source freshness redirect hops before following them', async () => {
    const sourceUrl = await import('../sources/sourceUrl');

    vi.mocked(axios.head)
      .mockResolvedValueOnce({
        status: 302,
        headers: {
          location: 'https://cdn.example.com/guide.xml'
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {
          etag: '"abc"'
        }
      });

    await expect(sourceChanged('source-1', 'https://example.com/guide.xml')).resolves.toBe(true);

    expect(sourceUrl.resolveSourceRedirectUrl).toHaveBeenCalledWith(
      'https://example.com/guide.xml',
      'https://cdn.example.com/guide.xml'
    );
    expect(sourceUrl.assertResolvedSourceUrlAllowed).toHaveBeenCalledWith('https://cdn.example.com/guide.xml');
    expect(axios.head).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.com/guide.xml',
      expect.objectContaining({
        maxRedirects: 0
      })
    );
  });

  it('treats null cached validators and missing response validators as equal', async () => {
    vi.mocked(getSourceCache).mockResolvedValue({
      etag: '"abc"',
      lastModified: null
    } as any);
    vi.mocked(axios.head).mockResolvedValue({
      status: 200,
      headers: {
        etag: '"abc"'
      }
    });

    await expect(sourceChanged('source-1', 'https://example.com/guide.xml')).resolves.toBe(false);

    expect(updateSourceCache).not.toHaveBeenCalled();
  });
});
