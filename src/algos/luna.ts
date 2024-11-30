import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../config';

// max 15 chars
export const shortname = 'luna';

export const requiresAuth = true;

const hasSeen = new Set<string>();

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid: string) => {
  if (hasSeen.has(requesterDid)) {
    return {
      feed: [
        {
          post: 'at://did:plc:k6acu4chiwkixvdedcmdgmal/app.bsky.feed.post/3lc3kim3d4c2z',
        },
      ],
    };
  }

  hasSeen.add(requesterDid);

  return {
    feed: [
      {
        // test post please ignore
        post: 'at://did:plc:k6acu4chiwkixvdedcmdgmal/app.bsky.feed.post/3lc364tfdhk2l',
      },
      {
        // netherlands test post
        post: 'at://did:plc:j7d55pifcqneuox644o7adp6/app.bsky.feed.post/3lc5ni2yvkk27',
      },
    ],
  };
};
