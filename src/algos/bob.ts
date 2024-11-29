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
    .orderBy('post.likes', 'desc')
    .limit(limit)
    .execute();

  console.info(
    `[bob] fetched ${posts.length} posts, averge likes is ${
      posts.reduce((acc, post) => acc + post.likeCount, 0) / posts.length
    }`,
  );

  const scoredPosts = posts.map((post) => {
    const postTime = new Date(post.indexedAt).getTime() / 1000;
    const nowSeconds = Date.now() / 1000;
    const timeDiff = nowSeconds - postTime;

    // Start with points = likes + 1 to avoid zero
    const points = Number(post.likeCount) + 1;
    const hours = timeDiff / 3600;

    // Remove the -1 from the formula since we want posts with 0 likes to still have a base score
    const score = points / Math.pow(hours + 2, GRAVITY);

    const controversyBonus = Math.log(Math.max(post.replyCount || 0, 1)) / 100;
    const finalScore = score + controversyBonus;

    return {
      ...post,
      score: finalScore,
    };
  });

  console.info(
    `[bob] scored ${scoredPosts.length} posts, average score is ${
      scoredPosts.reduce((acc, post) => acc + post.score, 0) / scoredPosts.length
    }`,
  );

  const processed = scoredPosts
    .filter((post) => post.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  console.info(`[bob] serving ${processed.length} posts`);

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
