import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../config';

// max 15 chars
export const shortname = 'cats';

export const requiresAuth = false;

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid?: string) => {
  const limit = Math.min(params.limit ?? 50, 100);

  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .where((eb) =>
      eb.or([
        // Match exact tags by ensuring they're bounded by commas or string edges
        eb('post.tags', 'like', 'cat,%'), // Starts with "cat"
        eb('post.tags', 'like', '%,cat,%'), // Has "cat" in middle
        eb('post.tags', 'like', '%,cat'), // Ends with "cat"
        eb('post.tags', '=', 'cat'), // Is exactly "cat"

        eb('post.tags', 'like', 'cats,%'), // Same pattern for "cats"
        eb('post.tags', 'like', '%,cats,%'),
        eb('post.tags', 'like', '%,cats'),
        eb('post.tags', '=', 'cats'),

        eb('post.tags', 'like', 'kitten,%'), // And for "kitten"
        eb('post.tags', 'like', '%,kitten,%'),
        eb('post.tags', 'like', '%,kitten'),
        eb('post.tags', '=', 'kitten'),

        // Keep partial matches for alt text
        eb('post.altText', 'like', '%cat%'),
        eb('post.altText', 'like', '%kitten%'),
      ]),
    )
    .limit(limit);

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString();
    builder = builder.where('post.indexedAt', '<', timeStr);
  }
  const res = await builder.execute();

  const feed = res.map((row) => ({
    post: row.uri,
  }));

  let cursor: string | undefined;
  const last = res.at(-1);
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString(10);
  }

  return {
    cursor,
    feed,
  };
};
