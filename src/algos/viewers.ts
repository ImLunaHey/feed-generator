import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../config';

// max 15 chars
export const shortname = 'viewers';

export const requiresAuth = true;

const hasSeen = new Map<string, Date>();

// every hour clear out the hasSeen set
setInterval(() => {
  const now = new Date();
  for (const [did, lastSeen] of hasSeen.entries()) {
    if (now.getTime() - lastSeen.getTime() > 1000 * 60 * 60) {
      hasSeen.delete(did);
    }
  }
}, 1000 * 60 * 60);

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid: string) => {
  hasSeen.set(requesterDid, new Date());

  const limit = Math.min(params.limit ?? 50, 100);
  const viewers = [...hasSeen.keys()];

  console.info(`[${shortname}] seen ${viewers.length} viewers`);

  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('post.author', 'in', viewers.length ? viewers : ['did:plc:k6acu4chiwkixvdedcmdgmal'])
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
