import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

function getRequestId(req: Request) {
  const header = req.header('x-request-id');

  if (header?.trim()) {
    return header.trim().slice(0, 128);
  }

  return crypto.randomUUID();
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
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip,
      userAgent: req.header('user-agent')
    }));
  });

  next();
}
