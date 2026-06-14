import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db/prisma';
import { channelRoutes } from './channelRoutes';

vi.mock('../db/prisma', () => ({
  prisma: {
    channel: {
      findMany: vi.fn()
    },
    program: {
      findMany: vi.fn()
    }
  }
}));

function app() {
  const instance = express();

  instance.use('/channels', channelRoutes);

  return instance;
}

describe('channelRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.channel.findMany).mockResolvedValue([]);
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
  });

  it('bounds channel list limits', async () => {
    const response = await request(app()).get('/channels?limit=50000');

    expect(response.status).toBe(200);
    expect(prisma.channel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 5000
    }));
  });

  it('bounds channel programme list limits', async () => {
    const response = await request(app()).get('/channels/channel-1/programs?limit=50000');

    expect(response.status).toBe(200);
    expect(prisma.program.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        channelId: 'channel-1'
      },
      take: 5000
    }));
  });
});
