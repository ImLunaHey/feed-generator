import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../config';

export const shortname = 'no-alt';
export const requiresAuth = false;

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid?: string) => {
  const limit = Math.min(params.limit ?? 50, 100);

  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('post.hasImage', '=', 1)
    .where('post.hasAlt', '=', 0)
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
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
