import { Request, Response, NextFunction } from 'express';

export async function requireExportToken(
  _req: Request,
  _res: Response,
  next: NextFunction
) {
  next();
}