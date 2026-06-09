import { prisma } from '../db/prisma';

async function main() {
  await prisma.source.updateMany({
    where: {
      name: {
        in: [
          'Schedules Direct',
          'IPTV-Org UK',
          'IPTV-Org US',
          'Custom XMLTV URL 1'
        ]
      }
    },
    data: {
      enabled: false
    }
  });

  console.log('Disabled invalid sources');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
