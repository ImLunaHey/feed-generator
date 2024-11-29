import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../config';

// max 15 chars
export const shortname = 'bob';
export const requiresAuth = false;

// Constants for score calculation
const GRAVITY = 1.8; // Controls how quickly posts fall off
const TIMEBASE = 45000; // ~12.5 hours in seconds

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid?: string) => {
  const limit = Math.min(params.limit ?? 50, 100);

  // Get posts with their like counts
  const posts = await ctx.db
    .selectFrom('post')
    .select(['post.uri', 'post.cid', 'post.indexedAt', 'post.replies as replyCount', 'post.likes as likeCount'])
    .orderBy('post.indexedAt', 'desc')
    .orderBy('post.cid', 'desc')
    .limit(limit * 2)
    .execute();

  const processed = posts
    .map((post) => {
      // const postTime = new Date(post.indexedAt).getTime() / 1000;
      // const nowSeconds = Date.now() / 1000;

      // // Calculate time difference in seconds
      // const timeDiff = nowSeconds - postTime;

      // // Reddit-style scoring
      // // Score = (P - 1) / (T + 2)^G
      // // where P = points (likes), T = time since submission in hours, G = gravity
      // const points = Number(post.likeCount) || 1; // Ensure minimum of 1 point
      // const hours = timeDiff / 3600;

      // // Basic hot score
      // const score = (points - 1) / Math.pow(hours + 2, GRAVITY);

      // // Controversy modifier based on reply count
      // const controversyBonus = Math.log(Math.max(post.replyCount || 0, 1)) / 100;

      // // Final score combining hot score and controversy
      // const finalScore = score + controversyBonus;

      return {
        ...post,
        score: 1,
      };
    })
    .filter((post) => post.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const feed = processed.map((post) => ({
    post: post.uri,
  }));

  const cursor =
    processed.length > 0
      ? Buffer.from(`${processed[processed.length - 1].indexedAt}:${processed[processed.length - 1].cid}`).toString('base64')
      : undefined;

  return {
    cursor,
    feed,
  };
};
