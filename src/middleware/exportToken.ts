import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { prisma } from '../db/prisma';

type ExportTokenScope = {
  profileId: string | null;
  providerId: string | null;
};

function routeScope(req: Request): ExportTokenScope {
  if (typeof req.params.id === 'string' && req.path.startsWith('/profile/')) {
    return {
      profileId: req.params.id,
      providerId: null
    };
  }

  if (typeof req.params.id === 'string' && req.path.startsWith('/provider/')) {
    return {
      profileId: null,
      providerId: req.params.id
    };
  }

  return {
    profileId: null,
    providerId: null
  };
}

function tokenAllowedForRoute(
  token: ExportTokenScope,
  route: ExportTokenScope
) {
  if (token.profileId && token.profileId !== route.profileId) {
    return false;
  }

  if (token.providerId && token.providerId !== route.providerId) {
    return false;
  }

  return true;
}

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

  if (!tokenAllowedForRoute(
    exportToken,
    routeScope(req)
  )) {
    return res.status(403).json({
      error: 'Export token is not allowed for this feed.'
    });
  }

  const updated = await prisma.exportToken.updateMany({
    where: {
      id: exportToken.id,
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
