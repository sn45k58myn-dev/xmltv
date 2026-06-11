import { prisma } from '../db/prisma';
import { enrichChannel } from '../enrichment/channelMetadata';

function countryFromSourceName(name: string) {
  if (/\b(US|USA|United States)\b/i.test(name)) return 'US';
  if (/\b(UK|GB|Great Britain|United Kingdom)\b/i.test(name)) return 'GB';
  return undefined;
}

function sourceIdsFromRefs(value: string | null) {
  if (!value) return [];

  try {
    const refs = JSON.parse(value) as Array<{ sourceId?: string }>;
    return refs.map((ref) => ref.sourceId).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

async function main() {
  const [
    channels,
    sources
  ] = await Promise.all([
    prisma.channel.findMany(),
    prisma.source.findMany({
      select: {
        id: true,
        name: true
      }
    })
  ]);
  const sourceCountryById = new Map(
    sources.map((source) => [source.id, countryFromSourceName(source.name)])
  );
  let updated = 0;

  for (const channel of channels) {
    const metadata = enrichChannel(channel.displayName);
    const sourceCountry = sourceIdsFromRefs(channel.sourceRefs)
      .map((sourceId) => sourceCountryById.get(sourceId))
      .find(Boolean);

    const country = sourceCountry ?? channel.country ?? metadata.country;
    const category = metadata.category ?? channel.category;

    if (country === channel.country && category === channel.category) {
      continue;
    }

    await prisma.channel.update({
      where: {
        id: channel.id
      },
      data: {
        country,
        category
      }
    });
    updated++;
  }

  console.log(`Processed ${channels.length} channels, updated ${updated}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
