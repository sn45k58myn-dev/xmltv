import { createRequire } from 'node:module';

const requirePackage = createRequire(__filename);
const packageJson = requirePackage('../../package.json') as {
  name: string;
  version: string;
  description?: string;
};

export const appInfo = {
  name: 'XMLTV Aggregator',
  packageName: packageJson.name,
  version: packageJson.version,
  description: packageJson.description ?? ''
};
