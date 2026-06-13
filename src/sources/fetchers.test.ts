import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchXmltvSource } from './fetchers';

vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}));

describe('fetchXmltvSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('applies a maximum remote feed download size', async () => {
    vi.mocked(axios.get).mockResolvedValue({
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
});
