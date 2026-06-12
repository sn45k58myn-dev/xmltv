import { Router } from 'express';
import {
  buildManifest,
  getCountryFeeds,
  getProviderFeeds,
  getSystemStats
} from '../services/manifestService';
import { getFeedMetadata } from '../services/feedMetadata';
import { getValidationSummary } from '../services/feedValidation';
import { getFeedQuality } from '../services/feedQuality';

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
      countries: await getCountryFeeds(),
      providers: await getProviderFeeds()
    });
  }
);

feedDiscoveryRoutes.get(
  '/providers',
  async (_req, res) => {
    res.json(await getProviderFeeds());
  }
);

feedDiscoveryRoutes.get(
  '/metadata',
  async (_req, res) => {
    res.json(await getFeedMetadata());
  }
);

feedDiscoveryRoutes.get(
  '/validation',
  async (_req, res) => {
    res.json(await getValidationSummary());
  }
);

feedDiscoveryRoutes.get(
  '/quality',
  async (_req, res) => {
    res.json(await getFeedQuality());
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
    res.json(
      await buildManifest()
    );
  }
);
