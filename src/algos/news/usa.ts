import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext, GeneratorContext } from '../../config';

// max 15 chars
export const shortname = 'news-usa';

export const requiresAuth = false;

const cache = new Set<{
  author: string;
  uri: string;
  cid: string;
  indexedAt: string;
  text: string;
  langs: string;
  likes: number;
  replies: number;
  labels: string;
  hasImage: number;
  hasAlt: number;
}>();

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid?: string) => {
  const posts = [...cache.values()];
  const limit = Math.min(params.limit, 30);

  // get the cursor
  let cursor = params.cursor;
  let cursorIndex = -1;
  if (cursor) {
    cursorIndex = posts.findIndex((p) => p.cid === cursor);
    if (cursorIndex === -1) {
      cursor = undefined;
    }
  }

  // get the next batch
  const feed = cursor ? posts.slice(cursorIndex + 1, cursorIndex + 1 + limit) : posts.slice(0, limit);

  // return the feed
  return {
    feed: feed.map((p) => ({
      post: p.uri,
    })),
    cursor: feed[feed.length - 1]?.cid,
  };
};

const sources = [
  'did:plc:6e7kgvbasqauptzi3ax2ehmw',
  'did:plc:oke5nz5jn666qgfqyambysv6',
  'did:plc:dzezcmpb3fhcpns4n4xm4ur5',
  'did:plc:wmho6q2uiyktkam3jsvrms3s',
  'did:plc:v7ch362fhgho32425wdugbto',
  'did:plc:rjuel2idbd5cvtf3toemjznp',
  'did:plc:eclio37ymobqex2ncko63h4r',
  'did:plc:ym6a73dx7kibs6fksyuzewem',
  'did:plc:h5s3fxfvfxsle5q6j4p3ozfv',
  'did:plc:l3lvnqac3azhbpbbyiqxxkzw',
  'did:plc:gvzwgrtlz2wqn3nipmg3fbys',
  'did:plc:anlicnys5zv7r34wjfnko6pc',
  'did:plc:7l75ck5g4b5k6gxqaq5rejit',
];

/**
 * Generator function for the feed skeleton
 */
export const generator = async (ctx: GeneratorContext) => {
  const res = await ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .where('author', 'in', sources)
    .limit(10_000)
    .execute();

  // empty the cache
  cache.clear();

  // add the new posts to the cache
  for (const row of res) {
    cache.add(row);
  }
};
