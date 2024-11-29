import { InvalidRequestError } from '@atproto/xrpc-server';
import { Server } from '../lexicon';
import { AppContext } from '../config';
import algos from '../algos';
import { validateAuth } from '../auth';
import { AtUri } from '@atproto/syntax';

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    try {
      const feedUri = new AtUri(params.feed);
      const algo = algos[feedUri.rkey].handler;

      if (feedUri.hostname !== ctx.cfg.publisherDid || feedUri.collection !== 'app.bsky.feed.generator' || !algo) {
        throw new InvalidRequestError('Unsupported algorithm', 'UnsupportedAlgorithm');
      }

      // Only check auth if the algorithm requires it
      const requiresAuth = algos[feedUri.rkey].requiresAuth;
      const requesterDid = requiresAuth ? await validateAuth(req, ctx.cfg.serviceDid, ctx.didResolver) : undefined;

      console.info(`[${feedUri.rkey}] ${requesterDid ?? 'unknown'} ${JSON.stringify(params)}`);

      const body = await algo(ctx, params, requesterDid);
      return {
        encoding: 'application/json',
        body: body,
      };
    } catch (error) {
      console.error('Error in feed generation', JSON.stringify(error));
      throw error;
    }
  });
}
