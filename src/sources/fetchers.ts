import axios from 'axios';
import fs from 'node:fs/promises';
import { SourceDefinition } from '../models/xmltv';

export async function fetchXmltvSource(source: SourceDefinition): Promise<string> {
  if (source.type === 'upload') {
    if (!source.url) throw new Error('Upload source missing file path');
    return fs.readFile(source.url, 'utf8');
  }

  if (source.type === 'schedules-direct') {
    throw new Error('Schedules Direct adapter placeholder: add JSON/token implementation for your lineup, then convert to XMLTV before parsing.');
  }

  if (!source.url) throw new Error(`Source ${source.name} missing URL`);
  const response = await axios.get(source.url, { timeout: 60000, responseType: 'text' });
  return response.data;
}
