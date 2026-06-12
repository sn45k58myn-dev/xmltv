import { getFeedMetadata } from './feedMetadata';
import { validateCachedFeeds } from './feedValidation';
import { prisma } from '../db/prisma';

type FeedValidationRow = {
  feedKey: string;
  valid: boolean;
  channels?: number;
  programs?: number;
  error?: string;
};

function ageHours(updatedAt: string) {
  return (Date.now() - new Date(updatedAt).getTime()) / 1000 / 60 / 60;
}

function scoreFeed(
  feed,
  validation?: FeedValidationRow
) {
  const reasons: string[] = [];
  let score = 100;

  if (!validation) {
    score -= 20;
    reasons.push('not validated');
  } else if (!validation.valid) {
    score -= 70;
    reasons.push(validation.error ?? 'invalid XMLTV');
  }

  if ((validation?.channels ?? 0) === 0) {
    score -= 15;
    reasons.push('no channels detected');
  }

  if ((validation?.programs ?? 0) === 0) {
    score -= 20;
    reasons.push('no programmes detected');
  }

  if (feed.bytes <= 0) {
    score -= 30;
    reasons.push('empty cache file');
  } else if (feed.bytes < 1024) {
    score -= 10;
    reasons.push('very small cache file');
  }

  const hoursOld = ageHours(feed.updatedAt);

  if (hoursOld > 24 * 7) {
    score -= 30;
    reasons.push('cache older than 7 days');
  } else if (hoursOld > 36) {
    score -= 15;
    reasons.push('cache older than 36 hours');
  }

  const normalizedScore = Math.max(
    0,
    Math.min(100, score)
  );

  return {
    feedKey: feed.feedKey,
    type: feed.type,
    bytes: feed.bytes,
    megabytes: feed.megabytes,
    updatedAt: feed.updatedAt,
    downloads: feed.downloads,
    lastDownloaded: feed.lastDownloaded,
    valid: validation?.valid ?? false,
    channels: validation?.channels ?? 0,
    programs: validation?.programs ?? 0,
    score: normalizedScore,
    grade: normalizedScore >= 90
      ? 'A'
      : normalizedScore >= 75
        ? 'B'
        : normalizedScore >= 60
          ? 'C'
          : normalizedScore >= 40
            ? 'D'
            : 'F',
    reasons
  };
}

export async function getFeedQuality(options: {
  persistSnapshot?: boolean;
} = {}) {
  const [metadata, validation] = await Promise.all([
    getFeedMetadata(),
    validateCachedFeeds()
  ]);
  const validationByFeed = new Map(
    validation.feeds.map((feed: FeedValidationRow) => [feed.feedKey, feed])
  );
  const feeds = metadata.cachedFeeds.map((feed) =>
    scoreFeed(
      feed,
      validationByFeed.get(feed.feedKey)
    )
  );
  const averageScore = feeds.length === 0
    ? 0
    : Number((
        feeds.reduce((sum, feed) => sum + feed.score, 0) / feeds.length
      ).toFixed(2));

  const result = {
    generatedAt: new Date().toISOString(),
    feedCount: feeds.length,
    averageScore,
    validFeeds: feeds.filter((feed) => feed.valid).length,
    invalidFeeds: feeds.filter((feed) => !feed.valid).length,
    feeds
  };

  if (options.persistSnapshot && feeds.length) {
    await prisma.feedQualitySnapshot.createMany({
      data: feeds.map((feed) => ({
        feedKey: feed.feedKey,
        score: feed.score,
        grade: feed.grade,
        valid: feed.valid,
        channels: feed.channels,
        programs: feed.programs,
        bytes: feed.bytes,
        reasons: JSON.stringify(feed.reasons)
      }))
    });
  }

  return result;
}

export async function getFeedQualityHistory(limit = 100) {
  return prisma.feedQualitySnapshot.findMany({
    orderBy: {
      createdAt: 'desc'
    },
    take: Math.min(
      Math.max(limit, 1),
      1000
    )
  });
}
