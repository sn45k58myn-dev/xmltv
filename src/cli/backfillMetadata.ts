import { prisma } from '../db/prisma';
import { enrichChannel } from '../enrichment/channelMetadata';

async function main() {
  const channels = await prisma.channel.findMany();

  for (const channel of channels) {
    const metadata = enrichChannel(channel.displayName);

    if (!metadata.country && !metadata.category) {
      continue;
    }

    await prisma.channel.update({
      where: {
        id: channel.id
      },
      data: {
        country: metadata.country ?? channel.country,
        category: metadata.category ?? channel.category
      }
    });
  }

  console.log(`Processed ${channels.length} channels`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
