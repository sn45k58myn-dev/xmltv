import fs from 'node:fs/promises';
import path from 'node:path';
import { parseXmltv } from '../pipeline/parseXmltv';
import { validateXmltv } from '../pipeline/validateXmltv';

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="sample.channel">
    <display-name>Sample Channel</display-name>
  </channel>
  <programme start="20260611090000 +0000" stop="20260611100000 +0000" channel="sample.channel">
    <title>Sample Programme</title>
    <desc>Import smoke test fixture.</desc>
  </programme>
</tv>`;

async function main() {
  const fixturePath = process.argv[2] ?? path.join(process.cwd(), 'test.xml');
  let xml: string;

  try {
    xml = await fs.readFile(fixturePath, 'utf8');
  } catch {
    xml = sampleXml;
  }

  const parsed = parseXmltv(xml);

  validateXmltv(parsed);

  console.log(
    `Import smoke passed: ${parsed.channels.length} channels, ${parsed.programs.length} programmes`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
