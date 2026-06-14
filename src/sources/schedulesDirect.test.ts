import { describe, expect, it, vi } from 'vitest';
import { fetchSchedulesDirectXmltv, SchedulesDirectClient } from './schedulesDirect';

function mockHttpClient() {
  return {
    post: vi.fn(),
    request: vi.fn()
  };
}

describe('SchedulesDirectClient', () => {
  it('authenticates and converts lineup schedules into XMLTV', async () => {
    const http = mockHttpClient();

    http.post.mockResolvedValue({
      data: {
        response: 'OK',
        token: 'token-1'
      }
    });
    http.request
      .mockResolvedValueOnce({
        data: {
          stations: [
            {
              stationID: '10001',
              callsign: 'TEST',
              name: 'Test Station',
              affiliate: 'PBS'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: [
          {
            stationID: '10001',
            programs: [
              {
                programID: 'EP000000010001',
                airDateTime: '2026-06-12T09:00:00Z',
                duration: 1800
              }
            ]
          }
        ]
      })
      .mockResolvedValueOnce({
        data: [
          {
            programID: 'EP000000010001',
            titles: [
              {
                title120: 'Morning & News'
              }
            ],
            episodeTitle150: 'Headlines',
            descriptions: {
              description100: [
                {
                  descriptionLanguage: 'Daily update'
                }
              ]
            },
            genres: ['News']
          }
        ]
      });

    const xml = await fetchSchedulesDirectXmltv(new SchedulesDirectClient(http as any, {
      username: 'sd-user',
      password: 'sd-pass',
      lineup: 'USA-OTA-12345',
      days: 1,
      baseUrl: 'https://example.test',
      timeoutMs: 1000
    }));

    expect(http.post).toHaveBeenCalledWith('/token', {
      username: 'sd-user',
      password: '8c47ea471d58e5e329bdb1552808b003d9c57f00'
    });
    expect(xml).toContain('<channel id="10001">');
    expect(xml).toContain('<display-name>TEST</display-name>');
    expect(xml).toContain('<title>Morning &amp; News</title>');
    expect(xml).toContain('<sub-title>Headlines</sub-title>');
    expect(xml).toContain('<category>News</category>');
    expect(xml).toContain('start="20260612090000 +0000"');
    expect(xml).toContain('stop="20260612093000 +0000"');
  });

  it('refreshes the token once after a 401 response', async () => {
    const http = mockHttpClient();
    const unauthorized = Object.assign(new Error('unauthorized'), {
      isAxiosError: true,
      response: {
        status: 401
      }
    });

    http.post
      .mockResolvedValueOnce({
        data: {
          response: 'OK',
          token: 'expired-token'
        }
      })
      .mockResolvedValueOnce({
        data: {
          response: 'OK',
          token: 'fresh-token'
        }
      });
    http.request
      .mockRejectedValueOnce(unauthorized)
      .mockResolvedValueOnce({
        data: [
          {
            lineup: 'USA-OTA-12345'
          }
        ]
      });

    const client = new SchedulesDirectClient(http as any, {
      username: 'sd-user',
      password: 'sd-pass',
      lineup: '',
      days: 1,
      baseUrl: 'https://example.test',
      timeoutMs: 1000
    });

    await expect(client.getLineup()).resolves.toBe('USA-OTA-12345');
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.request).toHaveBeenLastCalledWith(expect.objectContaining({
      headers: {
        token: 'fresh-token'
      }
    }));
  });

  it('batches large schedule requests for commercial lineups', async () => {
    const http = mockHttpClient();
    const stations = Array.from({
      length: 5001
    }, (_value, index) => ({
      stationID: `station-${index}`
    }));

    http.post.mockResolvedValue({
      data: {
        response: 'OK',
        token: 'token-1'
      }
    });
    http.request
      .mockResolvedValueOnce({
        data: [
          {
            stationID: 'station-0',
            programs: []
          }
        ]
      })
      .mockResolvedValueOnce({
        data: [
          {
            stationID: 'station-5000',
            programs: []
          }
        ]
      });

    const client = new SchedulesDirectClient(http as any, {
      username: 'sd-user',
      password: 'sd-pass',
      lineup: 'USA-OTA-12345',
      days: 1,
      baseUrl: 'https://example.test',
      timeoutMs: 1000
    });
    const schedules = await client.getSchedules(stations);

    expect(schedules).toHaveLength(2);
    expect(http.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: 'post',
      url: '/schedules',
      data: expect.arrayContaining([
        {
          stationID: 'station-0',
          date: expect.any(String)
        }
      ])
    }));
    expect(http.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'post',
      url: '/schedules',
      data: [
        {
          stationID: 'station-5000',
          date: expect.any(String)
        }
      ]
    }));
  });

  it('de-duplicates and batches program detail requests', async () => {
    const http = mockHttpClient();
    const programIds = [
      ...Array.from({
        length: 501
      }, (_value, index) => `EP${String(index).padStart(10, '0')}`),
      'EP0000000000'
    ];

    http.post.mockResolvedValue({
      data: {
        response: 'OK',
        token: 'token-1'
      }
    });
    http.request
      .mockResolvedValueOnce({
        data: [
          {
            programID: 'EP0000000000'
          }
        ]
      })
      .mockResolvedValueOnce({
        data: [
          {
            programID: 'EP0000000500'
          }
        ]
      });

    const client = new SchedulesDirectClient(http as any, {
      username: 'sd-user',
      password: 'sd-pass',
      lineup: 'USA-OTA-12345',
      days: 1,
      baseUrl: 'https://example.test',
      timeoutMs: 1000
    });
    const programs = await client.getPrograms(programIds);

    expect(programs.size).toBe(2);
    expect(http.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: 'post',
      url: '/programs',
      data: expect.arrayContaining(['EP0000000000'])
    }));
    expect(http.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'post',
      url: '/programs',
      data: ['EP0000000500']
    }));
  });

  it('skips malformed schedule programme windows when generating XMLTV', async () => {
    const http = mockHttpClient();

    http.post.mockResolvedValue({
      data: {
        response: 'OK',
        token: 'token-1'
      }
    });
    http.request
      .mockResolvedValueOnce({
        data: {
          stations: [
            {
              stationID: '10001',
              callsign: 'TEST'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: [
          {
            stationID: '10001',
            programs: [
              {
                programID: 'EPBADDATE',
                airDateTime: 'not-a-date',
                duration: 1800
              },
              {
                programID: 'EPBADDURATION',
                airDateTime: '2026-06-12T09:00:00Z',
                duration: 0
              },
              {
                programID: 'EPGOOD',
                airDateTime: '2026-06-12T10:00:00Z',
                duration: 1800
              }
            ]
          }
        ]
      })
      .mockResolvedValueOnce({
        data: [
          {
            programID: 'EPGOOD',
            titles: [
              {
                title120: 'Good Programme'
              }
            ]
          }
        ]
      });

    const xml = await fetchSchedulesDirectXmltv(new SchedulesDirectClient(http as any, {
      username: 'sd-user',
      password: 'sd-pass',
      lineup: 'USA-OTA-12345',
      days: 1,
      baseUrl: 'https://example.test',
      timeoutMs: 1000
    }));

    expect(xml).toContain('Good Programme');
    expect(xml).not.toContain('EPBADDATE');
    expect(xml).not.toContain('EPBADDURATION');
    expect(xml).not.toContain('NaN');
  });
});
