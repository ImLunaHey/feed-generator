import { InvalidRequestError } from '@atproto/xrpc-server';
import { Server } from '../lexicon';
import { AppContext } from '../config';
import algos from '../algos';
import { validateAuth } from '../auth';
import { AtUri } from '@atproto/syntax';

function retry<T>(fn: () => Promise<T> | T, maxAttempts = 3): Promise<T> {
  return new Promise<T>(async (resolve, reject) => {
    let lastError: Error;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await fn();
        return resolve(result);
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxAttempts - 1) {
          reject(lastError);
        }
      }
    }
  });
}

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
      const requesterDid = requiresAuth
        ? await retry(() => validateAuth(req, ctx.cfg.serviceDid, ctx.didResolver))
        : undefined;

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
