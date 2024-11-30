import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext, GeneratorContext } from '../../config';

// max 15 chars
export const shortname = 'lang-en';

export const requiresAuth = false;

const cache = new Set<{
  post: string;
}>();

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid?: string) => {
  const feed = [...cache.values()];

  const cursor = Number(params.cursor);
  if (cursor >= feed.length) {
    return {
      cursor: '-1',
      feed: [],
    };
  }

  if (cursor > 0) {
    feed.splice(0, cursor);
  }

  return {
    cursor: String(cursor),
    feed,
  };
};

/**
 * Generator function for the feed skeleton
 */
export const generator = async (ctx: GeneratorContext) => {
  const res = await ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .where('langs', 'like', 'en')
    .limit(10_000)
    .execute();

  // empty the cache
  cache.clear();

  // add the new posts to the cache
  for (const row of res) {
    cache.add({
      post: row.cid,
    });
  }
};
