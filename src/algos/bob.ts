import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../config';

// max 15 chars
export const shortname = 'bob';

export const requiresAuth = false;

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid?: string) => {
  const limit = Math.min(params.limit ?? 50, 100);

  const posts = await ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(limit * 2)
    .execute();

  const processed = posts
    .map((post) => {
      const age = Date.now() - new Date(post.indexedAt).getTime();
      const hoursSincePosted = age / (1000 * 60 * 60);

      // Simple time-based score
      const score = 1 / (1 + hoursSincePosted * 0.1);

      return {
        ...post,
        score,
      };
    })
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
