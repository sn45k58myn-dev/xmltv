import { Router } from 'express';
import { prisma } from '../db/prisma';
import { aliasCreateSchema, parseAdminPayload } from '../utils/adminPayloads';

export const aliasRoutes = Router();

aliasRoutes.get('/', async (_req, res) => {
  const aliases = await prisma.alias.findMany();
  res.json(aliases);
});

aliasRoutes.post('/', async (req, res) => {
  try {
    const data = parseAdminPayload(aliasCreateSchema, req.body);
    const alias = await prisma.alias.create({
      data: {
        value: data.value,
        normalized: data.normalized,
        channel: {
          connect: {
            id: data.channelId
          }
        }
      },
    });
    res.status(201).json(alias);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create alias' });
  }
});

aliasRoutes.delete('/:id', async (req, res) => {
  try {
    await prisma.alias.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: 'Failed to delete alias' });
  }
});
