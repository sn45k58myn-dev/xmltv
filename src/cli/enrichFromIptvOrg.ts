import axios from 'axios';
import { prisma } from '../db/prisma';
import { normalizeName } from '../utils/normalize';

type IptvOrgChannel = {
  id: string;
  name: string;
  alt_names?: string[];
  country?: string;
  categories?: string[];
};

const CATEGORY_MAP: Record<string, string> = {
  animation: 'Kids',
  auto: 'Lifestyle',
  business: 'News',
  classic: 'Entertainment',
  comedy: 'Comedy',
  cooking: 'Lifestyle',
  culture: 'Documentary',
  documentary: 'Documentary',
  education: 'Documentary',
  entertainment: 'Entertainment',
  family: 'Entertainment',
  general: 'Entertainment',
  kids: 'Kids',
  legislative: 'News',
  lifestyle: 'Lifestyle',
  movies: 'Movies',
  music: 'Music',
  news: 'News',
  outdoor: 'Lifestyle',
  relax: 'Lifestyle',
  religious: 'Religious',
  science: 'Documentary',
  series: 'Entertainment',
  shop: 'Shopping',
  sports: 'Sports',
  travel: 'Lifestyle',
  weather: 'News'
};

function cleanName(value: string) {
  return value
    .replace(/\b(hd|fhd|uhd|4k|sd)\b/gi, ' ')
    .replace(/\b(east|west|pacific|national feed|us|usa|uk|gb)\b/gi, ' ')
    .replace(/[+]/g, ' plus ')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryName(value: string | undefined) {
  if (!value) return undefined;

  return CATEGORY_MAP[value.toLowerCase()] ?? value
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function keysFor(name: string) {
  return Array.from(new Set([
    normalizeName(name),
    normalizeName(cleanName(name))
  ].filter(Boolean)));
}

async function main() {
  const overwrite = process.argv.includes('--overwrite');
  const url = 'https://iptv-org.github.io/api/channels.json';
  const response = await axios.get<IptvOrgChannel[]>(url, {
    timeout: 60000
  });
  const index = new Map<string, IptvOrgChannel>();

  for (const channel of response.data) {
    const names = [
      channel.name,
      ...(channel.alt_names ?? [])
    ];

    for (const name of names) {
      for (const key of keysFor(name)) {
        index.set(`${channel.country ?? ''}:${key}`, channel);
        index.set(`:${key}`, channel);
      }
    }
  }

  const channels = await prisma.channel.findMany();
  let matched = 0;
  let updated = 0;

  for (const channel of channels) {
    if (channel.category && !overwrite) {
      continue;
    }

    const keys = keysFor(channel.displayName);
    const match = keys
      .map((key) => index.get(`${channel.country ?? ''}:${key}`) ?? index.get(`:${key}`))
      .find((candidate) => candidate?.categories?.length);
    const category = categoryName(match?.categories?.[0]);

    if (!match || !category) {
      continue;
    }

    matched++;

    if (channel.category === category && channel.country === (channel.country ?? match.country)) {
      continue;
    }

    await prisma.channel.update({
      where: {
        id: channel.id
      },
      data: {
        category,
        country: channel.country ?? match.country ?? null
      }
    });
    updated++;
  }

  console.log(
    `IPTV-org enrichment matched ${matched} channels, updated ${updated}${overwrite ? ' with overwrite' : ''}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
