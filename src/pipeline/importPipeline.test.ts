import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runImport } from './importPipeline';
import { prisma } from '../db/prisma';
import { fetchXmltvSource } from '../sources/fetchers';
import { sourceChanged } from '../services/sourceChanged';
import { recordSourceFailure } from '../services/sourceReliability';

vi.mock('../db/prisma', () => ({
  prisma: {
    source: {
      upsert: vi.fn(),
      update: vi.fn()
    },
    importRun: {
      create: vi.fn(),
      update: vi.fn()
    },
    channel: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    alias: {
      findFirst: vi.fn()
    },
    program: {
      createMany: vi.fn()
    },
    sourceHealth: {
      create: vi.fn()
    }
  }
}));

vi.mock('../sources/fetchers', () => ({
  fetchXmltvSource: vi.fn()
}));

vi.mock('../services/sourceChanged', () => ({
  sourceChanged: vi.fn()
}));

vi.mock('../services/sourceReliability', () => ({
  recordSourceFailure: vi.fn()
}));

vi.mock('../services/programWindow', () => ({
  getLatestProgramStart: vi.fn().mockResolvedValue(null)
}));

describe('runImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.source.upsert).mockResolvedValue({
      id: 'source-1',
      name: 'Test Source US',
      type: 'custom-url',
      url: 'https://example.test/feed.xml',
      priority: 10
    } as any);
    vi.mocked(prisma.importRun.create).mockResolvedValue({
      id: 'import-1'
    } as any);
    vi.mocked(prisma.channel.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.alias.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.channel.create).mockResolvedValue({
      id: 'channel-1',
      xmltvId: 'sample.channel',
      displayName: 'Sample Channel'
    } as any);
    vi.mocked(prisma.channel.update).mockImplementation(async ({ data }) => ({
      id: 'channel-1',
      xmltvId: 'sample.channel',
      displayName: 'Sample Channel',
      sourceRefs: data.sourceRefs
    }) as any);
    vi.mocked(prisma.program.createMany).mockResolvedValue({
      count: 1
    } as any);
    vi.mocked(prisma.source.update).mockResolvedValue({} as any);
    vi.mocked(prisma.sourceHealth.create).mockResolvedValue({} as any);
    vi.mocked(recordSourceFailure).mockResolvedValue({
      disabled: false,
      failureStreak: 1,
      health: {}
    } as any);
    vi.mocked(prisma.importRun.update).mockResolvedValue({
      id: 'import-1',
      status: 'success',
      channelsSeen: 1,
      programsSeen: 1,
      channelsCreated: 1,
      programsCreated: 1
    } as any);
    vi.mocked(sourceChanged).mockResolvedValue(true);
    vi.mocked(fetchXmltvSource).mockResolvedValue(`
      <tv>
        <channel id="sample.channel">
          <display-name>Sample Channel</display-name>
          <display-name>Sample Alias</display-name>
        </channel>
        <programme start="20260612090000 +0000" stop="20260612100000 +0000" channel="sample.channel">
          <title>Morning Show</title>
          <category>News</category>
        </programme>
      </tv>
    `);
  });

  it('imports channels, aliases, and programmes from a fetched XMLTV source', async () => {
    const result = await runImport({
      name: 'Test Source US',
      type: 'custom-url',
      url: 'https://example.test/feed.xml',
      priority: 10
    });

    expect(result.status).toBe('success');
    expect(fetchXmltvSource).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test Source US'
    }));
    expect(prisma.channel.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        xmltvId: 'sample.channel',
        aliases: {
          create: expect.arrayContaining([
            expect.objectContaining({ value: 'Sample Channel' }),
            expect.objectContaining({ value: 'Sample Alias' })
          ])
        }
      })
    }));
    expect(prisma.program.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({
          channelId: 'channel-1',
          title: 'Morning Show',
          category: 'News'
        })
      ],
      skipDuplicates: true
    }));
    expect(prisma.importRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'success',
        channelsSeen: 1,
        programsSeen: 1
      })
    }));
  });

  it('skips remote freshness checks for uploaded XMLTV files', async () => {
    const result = await runImport({
      name: 'Upload guide.xml',
      type: 'upload',
      url: 'uploads/local-file'
    });

    expect(result.status).toBe('success');
    expect(sourceChanged).not.toHaveBeenCalled();
    expect(fetchXmltvSource).toHaveBeenCalledWith(expect.objectContaining({
      type: 'upload',
      url: 'uploads/local-file'
    }));
  });

  it('records source references when an existing channel is reused', async () => {
    vi.mocked(prisma.channel.findUnique).mockResolvedValue({
      id: 'channel-1',
      xmltvId: 'sample.channel',
      displayName: 'Sample Channel',
      sourceRefs: JSON.stringify([
        {
          sourceId: 'source-old',
          sourceChannelId: 'old.channel'
        }
      ])
    } as any);

    const result = await runImport({
      name: 'Test Source US',
      type: 'custom-url',
      url: 'https://example.test/feed.xml',
      priority: 10
    });

    expect(result.status).toBe('success');
    expect(prisma.channel.update).toHaveBeenCalledWith({
      where: {
        id: 'channel-1'
      },
      data: {
        sourceRefs: JSON.stringify([
          {
            sourceId: 'source-old',
            sourceChannelId: 'old.channel'
          },
          {
            sourceId: 'source-1',
            sourceChannelId: 'sample.channel'
          }
        ])
      }
    });
    expect(prisma.channel.create).not.toHaveBeenCalled();
  });

  it('delegates failed imports to source reliability policy', async () => {
    vi.mocked(fetchXmltvSource).mockRejectedValue(new Error('Source returned HTTP 500'));
    vi.mocked(prisma.importRun.update).mockResolvedValue({
      id: 'import-1',
      status: 'failed',
      errors: 'Source returned HTTP 500'
    } as any);

    const result = await runImport({
      name: 'Test Source US',
      type: 'custom-url',
      url: 'https://example.test/feed.xml',
      priority: 10
    });

    expect(result.status).toBe('failed');
    expect(recordSourceFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'source-1',
        name: 'Test Source US'
      }),
      'Source returned HTTP 500'
    );
  });
});
