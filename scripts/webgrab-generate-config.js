const fs = require('node:fs');
const path = require('node:path');
require('dotenv/config');

const ROOT_DIR = process.cwd();
const CONFIG_DIR = path.resolve(process.env.WEBGRAB_CONFIG_DIR || path.join(ROOT_DIR, 'webgrab', 'config'));
const TARGET_FILE = path.resolve(
  process.env.WEBGRAB_AUTO_CONFIG_FILE || path.join(CONFIG_DIR, 'WebGrab++.config.xml')
);
const COUNTRIES_ENV = process.env.WEBGRAB_COUNTRIES || '';

function readCountryList() {
  if (COUNTRIES_ENV.trim()) {
    return Array.from(
      new Set(
        COUNTRIES_ENV
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter((item) => /^[A-Z]{2,3}$/.test(item))
      )
    );
  }

  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      const values = Intl
        .supportedValuesOf('region')
        .filter((code) => /^[A-Z]{2}$/.test(code));

      if (values.length) {
        return values;
      }
    } catch (_error) {
      // Fall through to fallback list.
    }
  }

  // Fallback list for environments where supportedValuesOf is not available.
  return [
    'GB',
    'US',
    'AU',
    'CA',
    'DE',
    'ES',
    'FR',
    'IT',
    'IE',
    'NL',
    'NO',
    'SE',
    'DK',
    'PL',
    'PT',
    'NZ',
    'IN'
  ];
}

function buildConfigContent(countries) {
  const sites = countries
    .sort()
    .map((code) => `  <site country="${code}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<webgrab>\n` +
    `  <settings>\n` +
    `    <option name="log_path">./logs</option>\n` +
    `    <option name="log_level">2</option>\n` +
    `  </settings>\n` +
    `${sites}\n` +
    `</webgrab>\n`;
}

async function main() {
  await fs.promises.mkdir(CONFIG_DIR, { recursive: true });

  const countries = readCountryList().filter(Boolean);
  if (!countries.length) {
    throw new Error('No countries found. Set WEBGRAB_COUNTRIES with comma-separated values.');
  }

  const content = buildConfigContent(countries);
  await fs.promises.writeFile(TARGET_FILE, content, 'utf8');
  console.log(`Wrote ${countries.length} country entries to ${TARGET_FILE}`);
  console.log(`Sample: ${countries.slice(0, 5).join(', ')}${countries.length > 5 ? ', ...' : ''}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
