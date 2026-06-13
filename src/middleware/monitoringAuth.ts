import { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env';

function bearerToken(req: Request) {
  const authorization = req.header('authorization') ?? '';

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return undefined;
  }

  return authorization.slice('bearer '.length).trim();
}

function safeTokenEquals(
  supplied: string,
  expected: string
) {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);

  return suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function requireMonitoringToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const expected = env.MONITORING_TOKEN?.trim();

  if (!expected) {
    return next();
  }

  const supplied = String(req.header('x-monitoring-token') ?? bearerToken(req) ?? '').trim();

  if (!supplied || !safeTokenEquals(supplied, expected)) {
    return res.status(401).json({
      error: 'Monitoring token required. Send x-monitoring-token or Authorization: Bearer <token>.'
    });
  }

  return next();
}
