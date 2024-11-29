import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../config';

// max 15 chars
export const shortname = 'luna';

export const handler = async (ctx: AppContext, params: QueryParams) => {
  const feed = [
    {
      post: 'at://imlunahey.com/app.bsky.feed.post/3lc364tfdhk2l',
    },
  ];

  return {
    feed,
  };
};
