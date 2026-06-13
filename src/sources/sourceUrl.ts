import dns from 'node:dns/promises';
import net from 'node:net';

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

function isPrivateHostname(hostname: string) {
  const host = normalizeHostname(hostname);

  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  return isPrivateIpAddress(host);
}

function ipv4MappedIpv6ToDotted(host: string) {
  if (!host.startsWith('::ffff:')) {
    return undefined;
  }

  const suffix = host.slice('::ffff:'.length);

  if (suffix.includes('.')) {
    return suffix;
  }

  const parts = suffix.split(':');

  if (parts.length !== 2) {
    return undefined;
  }

  const [
    high,
    low
  ] = parts.map((part) => Number.parseInt(
    part,
    16
  ));

  if ([high, low].some((part) => Number.isNaN(part) || part < 0 || part > 0xffff)) {
    return undefined;
  }

  return [
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff
  ].join('.');
}

function isPrivateIpAddress(address: string) {
  const host = normalizeHostname(address);
  const mappedIpv4 = ipv4MappedIpv6ToDotted(host);

  if (mappedIpv4) {
    return isPrivateIpAddress(mappedIpv4);
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);

    if (octets.some((octet) => octet < 0 || octet > 255)) {
      return false;
    }

    const [
      first,
      second
    ] = octets;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first === 100 && second >= 64 && second <= 127 ||
      first === 169 && second === 254 ||
      first === 172 && second >= 16 && second <= 31 ||
      first === 192 && (second === 0 || second === 168) ||
      first === 198 && (second === 18 || second === 19) ||
      first >= 224
    );
  }

  if (net.isIPv6(host)) {
    return (
      host === '::' ||
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:')
    );
  }

  return false;
}

export function assertSourceUrlAllowed(url: string) {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Source URL is invalid.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Source URL must use http or https.');
  }

  if (process.env.NODE_ENV === 'production' && isPrivateHostname(parsed.hostname)) {
    throw new Error('Production source URLs cannot target localhost or private network addresses.');
  }

  return parsed;
}

export function resolveSourceRedirectUrl(
  currentUrl: string,
  location: string
) {
  let redirected: URL;

  try {
    redirected = new URL(
      location,
      currentUrl
    );
  } catch {
    throw new Error('Source redirect URL is invalid.');
  }

  return assertSourceUrlAllowed(redirected.toString());
}

export async function assertResolvedSourceUrlAllowed(url: string) {
  const parsed = assertSourceUrlAllowed(url);

  if (process.env.NODE_ENV !== 'production' || net.isIP(parsed.hostname)) {
    return;
  }

  const addresses = await dns.lookup(parsed.hostname, {
    all: true,
    verbatim: true
  });

  if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error('Production source URLs cannot resolve to localhost or private network addresses.');
  }
}
