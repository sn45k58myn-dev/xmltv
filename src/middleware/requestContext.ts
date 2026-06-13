import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

function getRequestId(req: Request) {
  const header = req.header('x-request-id');

  if (header?.trim()) {
    return header.trim().slice(0, 128);
  }

  return crypto.randomUUID();
}

function isSensitiveQueryKey(key: string) {
  const normalized = key.toLowerCase();

  return (
    normalized === 'authorization' ||
    normalized.includes('token') ||
    normalized.includes('key') ||
    normalized.includes('secret') ||
    normalized.includes('password')
  );
}

export function sanitizeRequestPath(originalUrl: string) {
  const queryStart = originalUrl.indexOf('?');

  if (queryStart === -1) {
    return originalUrl;
  }

  const path = originalUrl.slice(0, queryStart);
  const query = originalUrl.slice(queryStart + 1);
  const params = new URLSearchParams(query);

  for (const key of Array.from(params.keys())) {
    if (isSensitiveQueryKey(key)) {
      params.set(key, 'REDACTED');
    }
  }

  const sanitizedQuery = params.toString();

  return sanitizedQuery ? `${path}?${sanitizedQuery}` : path;
}

export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const started = process.hrtime.bigint();
  const requestId = getRequestId(req);

  req.requestId = requestId;
  res.setHeader(
    'x-request-id',
    requestId
  );

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;

    console.log(JSON.stringify({
      level: res.statusCode >= 500 ? 'error' : 'info',
      event: 'http_request',
      requestId,
      method: req.method,
      path: sanitizeRequestPath(req.originalUrl),
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip,
      userAgent: req.header('user-agent')
    }));
  });

  next();
}
