import { Router } from 'express';
import { buildApiDocs } from '../services/docsService';

export const docsRoutes = Router();

docsRoutes.get('/', (_req, res) => {
  res.json(buildApiDocs());
});
