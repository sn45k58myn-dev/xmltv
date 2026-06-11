import { Router } from 'express';
import {
  getCountryFeeds,
  getFeedManifest,
  getSystemStats
} from '../services/feedManifest';

export const feedDiscoveryRoutes = Router();

feedDiscoveryRoutes.get(
  '/countries',
  async (_req, res) => {
    res.json(await getCountryFeeds());
  }
);

feedDiscoveryRoutes.get(
  '/feeds',
  async (_req, res) => {
    res.json({
      countries: await getCountryFeeds()
    });
  }
);

feedDiscoveryRoutes.get(
  '/system',
  async (_req, res) => {
    res.json(await getSystemStats());
  }
);

feedDiscoveryRoutes.get(
  '/manifest',
  async (_req, res) => {
    res.json(await getFeedManifest());
  }
);
