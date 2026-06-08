export function normalizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/hd|uhd|4k/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
