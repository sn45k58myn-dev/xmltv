
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { env } from '../config/env';

export async function requireExportToken(req: Request, res: Response, next: NextFunction) {
  if (env.PUBLIC_EXPORTS === 'true') return next();
  const raw = req.query.token || req.header('x-export-token');
  if (!raw || typeof raw !== 'string') return res.status(401).json({ error: 'Export token required' });
  const token = await prisma.exportToken.findUnique({ where: { token: raw } });
  if (!token || !token.active) return res.status(403).json({ error: 'Invalid export token' });
  await prisma.exportToken.update({ where: { id: token.id }, data: { requests: { increment: 1 }, lastUsedAt: new Date() } });
  next();
}
