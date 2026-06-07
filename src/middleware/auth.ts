
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.header('x-admin-token') || req.query.adminToken;
  if (token === env.ADMIN_TOKEN) return next();
  res.status(401).json({ error: 'Admin token required. Send x-admin-token header.' });
}
