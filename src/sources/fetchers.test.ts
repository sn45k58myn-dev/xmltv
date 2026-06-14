import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchXmltvSource } from './fetchers';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    isAxiosError: vi.fn((error) => Boolean(error?.isAxiosError))
  }
}));

describe('fetchXmltvSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('applies a maximum remote feed download size', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 200,
      data: '<tv></tv>'
    });

    await expect(fetchXmltvSource({
      name: 'Remote',
      type: 'url',
      url: 'https://example.com/guide.xml'
    })).resolves.toBe('<tv></tv>');

    expect(axios.get).toHaveBeenCalledWith(
      'https://example.com/guide.xml',
      expect.objectContaining({
        maxContentLength: 1024 * 1024 * 1024,
        maxBodyLength: 1024 * 1024 * 1024,
        maxRedirects: 0
      })
    );
  });

  it('fails clearly when a source redirect has no location header', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 302,
      headers: {},
      data: ''
    });

    await expect(fetchXmltvSource({
      name: 'Remote',
      type: 'url',
      url: 'https://example.com/guide.xml'
    })).rejects.toThrow('did not include a Location header');
  });

  it('normalizes upstream HTTP failures into source-specific errors', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 500
      },
      message: 'Request failed with status code 500'
    });

    await expect(fetchXmltvSource({
      name: 'Ireland',
      type: 'url',
      url: 'https://www.free-epg.de/api/epg?country=IE'
    })).rejects.toThrow(
      'Source Ireland returned HTTP 500 from https://www.free-epg.de/api/epg?country=IE.'
    );

    expect(axios.get).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient upstream client errors', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404
      },
      message: 'Request failed with status code 404'
    });

    await expect(fetchXmltvSource({
      name: 'Missing',
      type: 'url',
      url: 'https://example.com/missing.xml'
    })).rejects.toThrow(
      'Source Missing returned HTTP 404 from https://example.com/missing.xml.'
    );

    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
