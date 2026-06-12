import fs from 'node:fs';

export interface ParsedXmltv {
  channels: any[];
  programmes: any[];
}

export async function parseXmltvFile(filePath: string): Promise<ParsedXmltv> {
  const _xml = fs.readFileSync(filePath, 'utf8');

  return {
    channels: [],
    programmes: []
  };
}
