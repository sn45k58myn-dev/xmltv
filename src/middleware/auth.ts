
import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { ApiKeyRole, validateApiKey } from '../services/apiKeys';

function safeTokenEquals(
  supplied: string,
  expected: string
) {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);

  return suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function bearerToken(req: Request) {
  const authorization = req.header('authorization') ?? '';

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return undefined;
  }

  return authorization.slice('bearer '.length).trim();
}

function adminToken(req: Request) {
  const headerToken = req.header('x-admin-token');

  if (headerToken) {
    return headerToken;
  }

  if (env.ALLOW_ADMIN_QUERY_TOKEN !== 'true') {
    return '';
  }

  const queryToken = Array.isArray(req.query.adminToken)
    ? req.query.adminToken[0]
    : req.query.adminToken;

  return String(queryToken ?? '');
}

export function requireRole(roles: ApiKeyRole[]) {
  return async function requireRoleMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const suppliedAdminToken = adminToken(req);

    if (suppliedAdminToken && safeTokenEquals(suppliedAdminToken, env.ADMIN_TOKEN)) {
      req.auth = {
        actor: 'admin-token',
        role: 'admin'
      };
      return next();
    }

    const apiKey = String(req.header('x-api-key') ?? bearerToken(req) ?? '').trim();

    if (!apiKey) {
      return res.status(401).json({
        error: 'Admin credentials required. Send x-admin-token, x-api-key, or Authorization: Bearer <api-key>.'
      });
    }

    const authenticated = await validateApiKey(apiKey);

    if (!authenticated) {
      return res.status(401).json({
        error: 'Invalid or inactive API key.'
      });
    }

    if (!roles.includes(authenticated.role)) {
      return res.status(403).json({
        error: 'API key role is not allowed for this route.'
      });
    }

    req.auth = {
      actor: `api-key:${authenticated.id}`,
      role: authenticated.role,
      apiKeyId: authenticated.id
    };

    return next();
  };
}

export const requireAdmin = requireRole(['admin']);
export const requireOperator = requireRole(['admin', 'operator']);
