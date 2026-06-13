import { NextFunction, Request, Response } from 'express';

export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('cross-origin-resource-policy', 'same-origin');
  res.setHeader(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  next();
}
