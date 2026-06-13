import { NextFunction, Request, Response } from 'express';

export function noStore(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  res.setHeader('cache-control', 'no-store');
  next();
}
