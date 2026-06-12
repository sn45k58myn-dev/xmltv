export function providerFeedKey(providerId: string) {
  const safeId = providerId.replace(/[^a-z0-9_.-]/gi, '_');

  return `provider_${safeId}`;
}
