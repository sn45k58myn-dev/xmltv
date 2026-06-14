import { env, webgrabSourceFiles, customXmltvUrls } from '../config/env';
import { SourceDefinition } from '../models/xmltv';
import path from 'node:path';

function looksLikeLocalPath(value: string) {
  const trimmed = value.trim();

  return (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    /^[A-Za-z]:[\\/]/.test(trimmed)
  );
}

function normalizeFileSourceUrl(value: string) {
  const trimmed = value.trim();

  return path.resolve(process.cwd(), trimmed);
}

function fileNameForSource(base: string) {
  if (base.includes('/') || base.includes('\\')) {
    return path.basename(base);
  }

  return base;
}

export function getConfiguredSources() {
  const sources: SourceDefinition[] = [
    {
      name: 'epg.pw UK',
      type: 'epg.pw',
      url: 'https://epg.pw/xmltv/epg_GB.xml',
      priority: 10
    },
    {
      name: 'epg.pw US',
      type: 'epg.pw',
      url: 'https://epg.pw/xmltv/epg_US.xml',
      priority: 10
    }
  ];

  if (env.SCHEDULES_DIRECT_USERNAME && env.SCHEDULES_DIRECT_PASSWORD) {
    sources.push({
      name: 'Schedules Direct',
      type: 'schedules-direct',
      priority: 20
    });
  }

  for (const [index, rawUrl] of customXmltvUrls.entries()) {
    const isLocal = looksLikeLocalPath(rawUrl);

    sources.push({
      name: `Custom XMLTV ${index + 1}`,
      type: isLocal ? 'upload' : 'custom-url',
      url: isLocal ? normalizeFileSourceUrl(rawUrl) : rawUrl,
      priority: 30 + index,
    });
  }

  for (const [index, rawPath] of webgrabSourceFiles.entries()) {
    const absPath = normalizeFileSourceUrl(rawPath);
    const fileName = fileNameForSource(absPath);

    sources.push({
      name: `WebGrab ${fileName}`,
      type: 'upload',
      url: absPath,
      priority: 60 + index,
    });
  }

  return sources;
}
