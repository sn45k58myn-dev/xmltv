import { prisma } from '../db/prisma';

function parseSourceRefs(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function mergeChannels(targetChannelId: string, channelIdsToMerge: string[]) {
  if (channelIdsToMerge.length === 0) return { success: true, targetChannelId };

  return prisma.$transaction(async (tx) => {
    // Get the target channel
    const targetChannel = await tx.channel.findUniqueOrThrow({
      where: { id: targetChannelId }
    });

    const mergedRefs = parseSourceRefs(targetChannel.sourceRefs);

    for (const mergeId of channelIdsToMerge) {
      if (mergeId === targetChannelId) continue;

      const sourceChannel = await tx.channel.findUnique({ where: { id: mergeId } });
      if (!sourceChannel) continue;

      // 1. Reassign programs
      await tx.program.updateMany({
        where: { channelId: mergeId },
        data: { channelId: targetChannelId }
      });

      // 2. Reassign aliases
      const aliases = await tx.alias.findMany({ where: { channelId: mergeId } });
      for (const alias of aliases) {
        // Check for uniqueness conflict before moving
        const existing = await tx.alias.findUnique({
          where: { channelId_normalized: { channelId: targetChannelId, normalized: alias.normalized } }
        });
        if (!existing) {
          await tx.alias.update({
            where: { id: alias.id },
            data: { channelId: targetChannelId }
          });
        } else {
          await tx.alias.delete({ where: { id: alias.id } });
        }
      }

      // 3. Reassign mappings
      const mappings = await tx.mapping.findMany({ where: { channelId: mergeId } });
      for (const mapping of mappings) {
        const existing = await tx.mapping.findUnique({
          where: { providerId_providerChannelId: { providerId: mapping.providerId, providerChannelId: mapping.providerChannelId } }
        });
        if (!existing) {
          await tx.mapping.update({
            where: { id: mapping.id },
            data: { channelId: targetChannelId }
          });
        } else {
          await tx.mapping.delete({ where: { id: mapping.id } });
        }
      }

      // 4. Update sourceRefs
      const refs = parseSourceRefs(sourceChannel.sourceRefs);
      for (const ref of refs) {
        if (!mergedRefs.some((r: any) => r.sourceId === ref.sourceId && r.sourceChannelId === ref.sourceChannelId)) {
          mergedRefs.push(ref);
        }
      }

      // 5. Delete old channel
      await tx.channel.delete({ where: { id: mergeId } });
    }

    // Update target channel sourceRefs
    await tx.channel.update({
      where: { id: targetChannelId },
      data: { sourceRefs: JSON.stringify(mergedRefs) }
    });

    return { success: true, targetChannelId, mergedCount: channelIdsToMerge.length };
  });
}
