import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../config';

export const shortname = 'bob';
export const requiresAuth = false;

// Constants for score calculation
const GRAVITY = 1.8;

const scorePost = (post: {
  uri: string;
  cid: string;
  indexedAt: string;
  text: string;
  labels: string;
  hasImage: number;
  hasAlt: number;
  replyCount: number;
  likeCount: number;
}) => {
  const bannedWords = [
    'maga',
    'trump',
    'biden',
    'covid',
    'vaccine',
    'election',
    'politics',
    'racism',
    'hate',
    'war',
    'bomb',
    'gun',
    'violence',
    'kill',
    'donate',
    'money',
    'fund',
    'buy',
    'sell',
    'vbucks',
  ];

  // Penalize posts with banned words
  if (bannedWords.some((word) => post.text?.toLowerCase().includes(word))) {
    console.info(`[bob] post ${post.uri} contains banned words`);
    return {
      ...post,
      score: 0,
    };
  }

  // Penalize posts with images but no alt text
  if (post.hasImage === 1 && post.hasAlt === 0) {
    console.info(`[bob] post ${post.uri} has image but no alt text`);
    return {
      ...post,
      score: 0,
    };
  }

  // Penalize posts with no text
  if (!post.text) {
    console.info(`[bob] post ${post.uri} has no text`);
    return {
      ...post,
      score: 0,
    };
  }

  // Penalize posts with nsfw labels
  if (post.labels?.includes('nsfw') || post.labels?.includes('porn')) {
    console.info(`[bob] post ${post.uri} has nsfw labels`);
    return {
      ...post,
      score: 0,
    };
  }

  const postTime = new Date(post.indexedAt).getTime() / 1000;
  const nowSeconds = Date.now() / 1000;
  const timeDiff = nowSeconds - postTime;
  const points = Number(post.likeCount) + 1;
  const hours = timeDiff / 3600;
  const score = points / Math.pow(hours + 2, GRAVITY);
  const controversyBonus = Math.log(Math.max(post.replyCount || 0, 1)) / 100;
  console.info(`[bob] post ${post.uri} has score ${score + controversyBonus}`);

  return {
    ...post,
    score: score + controversyBonus,
  };
};

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid?: string) => {
  const limit = Math.min(params.limit ?? 50, 100);

  // Decode cursor if provided
  let cursorData: { score: number; cid: string } | undefined;
  if (params.cursor) {
    try {
      const [score, cid] = Buffer.from(params.cursor, 'base64').toString().split(':');
      cursorData = { score: parseFloat(score), cid };
    } catch (error) {
      console.error('Invalid cursor:', error);
    }
  }

  // First, get all posts ordered by potential score indicators
  const posts = await ctx.db
    .selectFrom('post')
    .select([
      'post.uri',
      'post.cid',
      'post.text',
      'post.indexedAt',
      'post.replies as replyCount',
      'post.likes as likeCount',
      'post.labels',
      'post.hasImage',
      'post.hasAlt',
    ])
    .orderBy('post.likes', 'desc')
    .orderBy('post.replies', 'desc')
    .limit(1_000)
    .execute();

  // Score all posts
  const scoredPosts = posts
    .map(scorePost)
    .filter((post) => post.score > 0)
    .sort((a, b) => b.score - a.score);

  // Apply cursor pagination after scoring
  let startIndex = 0;
  if (cursorData) {
    startIndex = scoredPosts.findIndex(
      (post) => post.score < cursorData.score || (post.score === cursorData.score && post.cid < cursorData.cid),
    );
    startIndex = startIndex === -1 ? scoredPosts.length : startIndex;
  }

  // Get the page of posts
  const processed = scoredPosts.slice(startIndex, startIndex + limit);

  console.info(`[bob] serving ${processed.length} posts`);

  const feed = processed.map((post) => ({
    post: post.uri,
  }));

  // Create cursor based on score instead of timestamp
  const cursor =
    processed.length > 0
      ? Buffer.from(`${processed[processed.length - 1].score}:${processed[processed.length - 1].cid}`).toString('base64')
      : undefined;

  return {
    cursor,
    feed,
  };
};
