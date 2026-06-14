const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv/config');

const ROOT_DIR = process.cwd();
const CONFIG_DIR = path.resolve(process.env.WEBGRAB_CONFIG_DIR || path.join(ROOT_DIR, 'webgrab', 'config'));
const TARGET_FILE = process.env.WEBGRAB_AUTO_CONFIG_FILE || path.join(CONFIG_DIR, 'WebGrab++.config.xml');

const DEFAULT_COUNTRIES = [
  'AU', 'AT', 'BE', 'BR', 'CA', 'CH', 'CL', 'CO', 'CZ', 'DE', 'DK', 'EE', 'ES',
  'FI', 'FR', 'GB', 'GR', 'HK', 'HU', 'IE', 'IL', 'IN', 'IT', 'JP', 'KR', 'MX',
  'NL', 'NO', 'NZ', 'PE', 'PL', 'PT', 'RU', 'SE', 'SG', 'TH', 'TR', 'TW', 'US'
];

function normalizeCountryList(values) {
  return [...new Set(
    values
      .map((value) => value.trim().toUpperCase())
      .filter((value) => /^[A-Z]{2,3}$/.test(value))
  )].sort();
}

function collectFromEnvironment() {
  const configured = process.env.WEBGRAB_COUNTRIES;
  if (!configured) {
    return [];
  }

  return normalizeCountryList(configured.split(','));
}

function collectCountryFromFileName(fileName) {
  const normalized = fileName.toUpperCase();
  const withoutExtension = normalized.split('.').slice(0, -1).join('.');
  const tokens = [
    ...withoutExtension.split(/[-._]/),
    ...withoutExtension.split('.')
  ];

  for (const token of tokens) {
    if (/^[A-Z]{2}$/.test(token)) {
      return token;
    }
  }

  return null;
}

function collectFromDirectory(rootPath, candidates) {
  if (!fs.existsSync(rootPath)) {
    return;
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.toUpperCase() !== 'SITEINI' && /^[A-Z]{2}$/i.test(entry.name)) {
        candidates.add(entry.name.toUpperCase());
      }
      collectFromDirectory(entryPath, candidates);
      continue;
    }

    if (entry.name.startsWith('.')) {
      continue;
    }

    const code = collectCountryFromFileName(entry.name);
    if (code) {
      candidates.add(code);
    }
  }
}

function collectFromSiteIni(siteIniRoot) {
  if (!siteIniRoot || !fs.existsSync(siteIniRoot)) {
    return [];
  }

  const candidates = new Set();
  collectFromDirectory(siteIniRoot, candidates);
  return normalizeCountryList(Array.from(candidates)).filter((value) => value.length === 2);
}

function listSiteIniCountryDirectories(siteIniRoot = locateSiteIniRoot()) {
  if (!siteIniRoot || !fs.existsSync(siteIniRoot)) {
    return [];
  }

  return fs.readdirSync(siteIniRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.toUpperCase() !== 'SITEINI')
    .map((entry) => ({
      name: entry.name,
      path: path.join(siteIniRoot, entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function collectFromIntl() {
  let supported = [];

  try {
    supported = Intl?.supportedValuesOf?.('region') ?? [];
  } catch (_error) {
    supported = [];
  }

  if (!supported?.length) {
    return [];
  }

  return normalizeCountryList(supported).filter((value) => value.length === 2);
}

function locateSiteIniRoot() {
  const explicit = process.env.WEBGRAB_SITEINI_DIR?.trim();
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }

  const candidates = [
    path.join(CONFIG_DIR, 'siteini'),
    path.join(CONFIG_DIR, 'siteini.pack'),
    path.join(CONFIG_DIR, 'siteini.pack', 'siteini'),
    path.join(CONFIG_DIR, 'siteini.pack', 'sites'),
    path.join(CONFIG_DIR, 'siteinipack')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function buildCountries() {
  const byEnv = collectFromEnvironment();
  if (byEnv.length) {
    return byEnv;
  }

  const siteIniRoot = locateSiteIniRoot();
  if (siteIniRoot) {
    const siteIniCountries = collectFromSiteIni(siteIniRoot);
    if (siteIniCountries.length) {
      return siteIniCountries;
    }
  }

  const explicitTmpPaths = [
    path.join(process.cwd(), 'webgrab', '.tmp', 'siteinipack', 'siteini.pack'),
    path.join(process.cwd(), 'webgrab', '.tmp', 'siteinipack', 'siteini')
  ];

  for (const candidate of explicitTmpPaths) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const siteIniCountries = collectFromSiteIni(candidate);
    if (siteIniCountries.length) {
      return siteIniCountries;
    }
  }

  const intlCountries = collectFromIntl();
  if (intlCountries.length) {
    return intlCountries;
  }

  return DEFAULT_COUNTRIES;
}

function buildConfigXml(countries) {
  const sites = countries
    .map((code) => `  <site country="${code}" />`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<webgrab>',
    '  <settings>',
    '    <option name="log_path">./logs</option>',
    '    <option name="log_level">2</option>',
    '  </settings>',
    sites,
    '</webgrab>'
  ].join('\n') + '\n';
}

async function generateConfigFile(options = {}) {
  const { targetFile = TARGET_FILE, overwrite = true } = options;

  if (!overwrite && fs.existsSync(targetFile)) {
    console.log(`Skipping existing config file ${targetFile}`);
    return targetFile;
  }

  const countries = buildCountries();
  const payload = buildConfigXml(countries);
  await fsp.mkdir(path.dirname(targetFile), { recursive: true });
  await fsp.writeFile(targetFile, payload, 'utf8');

  console.log(`Generated ${targetFile} with ${countries.length} countries`);
  return targetFile;
}

async function main() {
  await fsp.mkdir(CONFIG_DIR, { recursive: true });
  const countries = buildCountries().filter(Boolean);
  if (!countries.length) {
    throw new Error('No countries found. Set WEBGRAB_COUNTRIES with comma-separated values.');
  }

  await generateConfigFile({ targetFile: TARGET_FILE, overwrite: true });
  console.log(`Sample: ${countries.slice(0, 5).join(', ')}${countries.length > 5 ? ', ...' : ''}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  generateConfigFile,
  collectFromEnvironment,
  collectFromSiteIni,
  collectFromIntl,
  normalizeCountryList,
  buildCountries,
  locateSiteIniRoot,
  listSiteIniCountryDirectories
};
