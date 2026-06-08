import { prisma } from '../db/prisma';

export async function mergeChannels(targetChannelId: string, channelIdsToMerge: string[]) {
  if (channelIdsToMerge.length === 0) return { success: true, targetChannelId };

  // Get the target channel
  const targetChannel = await prisma.channel.findUniqueOrThrow({
    where: { id: targetChannelId }
  });

  const mergedRefs = targetChannel.sourceRefs ? JSON.parse(targetChannel.sourceRefs) : [];

  for (const mergeId of channelIdsToMerge) {
    if (mergeId === targetChannelId) continue;

    const sourceChannel = await prisma.channel.findUnique({ where: { id: mergeId } });
    if (!sourceChannel) continue;

    // 1. Reassign programs
    await prisma.program.updateMany({
      where: { channelId: mergeId },
      data: { channelId: targetChannelId }
    });

    // 2. Reassign aliases
    const aliases = await prisma.alias.findMany({ where: { channelId: mergeId } });
    for (const alias of aliases) {
      // Check for uniqueness conflict before moving
      const existing = await prisma.alias.findUnique({
        where: { channelId_normalized: { channelId: targetChannelId, normalized: alias.normalized } }
      });
      if (!existing) {
        await prisma.alias.update({
          where: { id: alias.id },
          data: { channelId: targetChannelId }
        });
      } else {
        await prisma.alias.delete({ where: { id: alias.id } });
      }
    }

    // 3. Reassign mappings
    const mappings = await prisma.mapping.findMany({ where: { channelId: mergeId } });
    for (const mapping of mappings) {
      const existing = await prisma.mapping.findUnique({
        where: { providerId_providerChannelId: { providerId: mapping.providerId, providerChannelId: mapping.providerChannelId } }
      });
      if (!existing) {
         await prisma.mapping.update({
             where: { id: mapping.id },
             data: { channelId: targetChannelId }
         });
      } else {
          await prisma.mapping.delete({ where: { id: mapping.id } });
      }
    }

    // 4. Update sourceRefs
    if (sourceChannel.sourceRefs) {
      const refs = JSON.parse(sourceChannel.sourceRefs);
      for (const ref of refs) {
        if (!mergedRefs.some((r: any) => r.sourceId === ref.sourceId && r.sourceChannelId === ref.sourceChannelId)) {
          mergedRefs.push(ref);
        }
      }
    }

    // 5. Delete old channel
    await prisma.channel.delete({ where: { id: mergeId } });
  }

  // Update target channel sourceRefs
  await prisma.channel.update({
    where: { id: targetChannelId },
    data: { sourceRefs: JSON.stringify(mergedRefs) }
  });

  return { success: true, targetChannelId, mergedCount: channelIdsToMerge.length };
}
