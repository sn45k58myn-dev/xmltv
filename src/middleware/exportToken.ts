import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { prisma } from '../db/prisma';

export async function requireExportToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (env.PUBLIC_EXPORTS === 'true') {
    return next();
  }

  const queryToken = Array.isArray(req.query.token)
    ? req.query.token[0]
    : req.query.token;
  const headerToken = req.header('x-export-token');
  const token = String(headerToken ?? queryToken ?? '').trim();

  if (!token) {
    return res.status(401).json({
      error: 'Export token required. Pass ?token=<token> or x-export-token header.'
    });
  }

  const updated = await prisma.exportToken.updateMany({
    where: {
      token,
      active: true
    },
    data: {
      requests: {
        increment: 1
      },
      lastUsedAt: new Date()
    }
  });

  if (updated.count !== 1) {
    return res.status(401).json({
      error: 'Invalid or inactive export token.'
    });
  }

  return next();
}
