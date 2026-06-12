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
  const token = String(queryToken ?? headerToken ?? '').trim();

  if (!token) {
    return res.status(401).json({
      error: 'Export token required. Pass ?token=<token> or x-export-token header.'
    });
  }

  const exportToken = await prisma.exportToken.findUnique({
    where: {
      token
    }
  });

  if (!exportToken?.active) {
    return res.status(401).json({
      error: 'Invalid or inactive export token.'
    });
  }

  await prisma.exportToken.update({
    where: {
      id: exportToken.id
    },
    data: {
      requests: {
        increment: 1
      },
      lastUsedAt: new Date()
    }
  });

  return next();
}
