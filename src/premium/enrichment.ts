
import axios from 'axios';
import { prisma } from '../db/prisma';
import { env } from '../config/env';

export async function enrichProgramWithTmdb(programId: string) {
  const program = await prisma.program.findUniqueOrThrow({ where: { id: programId } });
  if (!env.TMDB_API_KEY) return { skipped: true, reason: 'TMDB_API_KEY not configured' };
  const url = 'https://api.themoviedb.org/3/search/multi';
  const { data } = await axios.get(url, { params: { api_key: env.TMDB_API_KEY, query: program.title } });
  const best = data.results?.[0];
  if (!best) return { matched: false };
  return prisma.program.update({
    where: { id: programId },
    data: {
      tmdbId: String(best.id),
      image: best.poster_path ? `https://image.tmdb.org/t/p/w500${best.poster_path}` : program.image,
      seriesId: best.media_type === 'tv' ? String(best.id) : program.seriesId
    }
  });
}

export async function enrichChannelAssets(channelId: string, logo?: string, image?: string) {
  return prisma.channel.update({ where: { id: channelId }, data: { logo, image, icon: logo ?? undefined } });
}

export async function attachCatchupMetadata(programId: string, catchupUrl: string, catchupDays = 7) {
  return prisma.program.update({ where: { id: programId }, data: { catchupUrl, catchupDays } });
}
