import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../config';

// max 15 chars
export const shortname = 'cats';

export const requiresAuth = false;

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid?: string) => {
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .where('post.text', 'like', 'cat')
    .limit(params.limit);

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
