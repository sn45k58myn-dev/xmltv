
import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env';

function safeTokenEquals(
  supplied: string,
  expected: string
) {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);

  return suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const queryToken = Array.isArray(req.query.adminToken)
    ? req.query.adminToken[0]
    : req.query.adminToken;
  const token = String(req.header('x-admin-token') ?? queryToken ?? '');

  if (token && safeTokenEquals(token, env.ADMIN_TOKEN)) return next();

  res.status(401).json({ error: 'Admin token required. Send x-admin-token header.' });
}
