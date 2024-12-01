import { Hono, HonoRequest } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { AtUri } from '@atproto/syntax';
import { AuthRequiredError, InvalidRequestError, verifyJwt } from '@atproto/xrpc-server';
import algos from '../algos';
import { DidResolver, MemoryCache } from '@atproto/identity';
import { Database, migrateToLatest } from '../db';
import { config } from './config';
import { db } from './db';
import { jetstream } from './firehose';

const app = new Hono<{
  Variables: {
    db: Database;
    didResolver: DidResolver;
    config: typeof config;
  };
}>();

app.use('/*', async (ctx, next) => {
  ctx.set('db', db);
  ctx.set('didResolver', didResolver);
  ctx.set('config', config);
  return next();
});

const didCache = new MemoryCache();
const didResolver = new DidResolver({
  plcUrl: 'https://plc.directory',
  didCache,
});

const validateAuth = async (req: HonoRequest) => {
  const authorization = req.header('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new AuthRequiredError();
  }
  const jwt = authorization.replace('Bearer ', '').trim();
  const originalUrl = new URL(req.url).pathname;
  const nsid_ = originalUrl.replace('/xrpc/', '');
  const nsid = nsid_.endsWith('/') ? nsid_.slice(0, -1) : nsid_; // trim trailing slash
  const parsed = await verifyJwt(jwt, config.serviceDid, nsid, async (did: string) => {
    return didResolver.resolveAtprotoKey(did);
  });
  return parsed.iss;
};

// Enable CORS
app.use('/*', cors());

app.get('/stats', async (ctx) => {
  const feed = ctx.req.query('feed') || 'all';
  const user = ctx.req.query('user') || 'guest';
  let builder = db.selectFrom('feed_stats').where('user', '=', user).selectAll();
  if (feed !== 'all') {
    builder = builder.where('feed', '=', feed);
  }
  const feedStats = await builder.execute();
  return ctx.json(feedStats);
});

// Feed Skeleton endpoint
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', async (ctx) => {
  try {
    // Validate the feed parameter
    const feed = ctx.req.query('feed');
    if (!feed) throw new InvalidRequestError('Missing feed parameter', 'MissingFeed');

    // Parse the feed URI
    const feedUri = new AtUri(feed);
    console.info(`generating algo=${feedUri.rkey} query=${JSON.stringify(ctx.req.query())}`);

    // Check if the feed algorithm is supported
    const algo = algos[feedUri.rkey];
    if (!algo) throw new InvalidRequestError('Unsupported algorithm', 'UnsupportedAlgorithm');

    // Only check auth if the algorithm requires it
    const requiresAuth = algos[feedUri.rkey].requiresAuth;
    const requesterDid = requiresAuth ? await validateAuth(ctx.req) : undefined;

    // Generate the feed
    const response = await algo.handler(
      {
        db: ctx.get('db'),
        didResolver: ctx.get('didResolver'),
        cfg: {
          ...ctx.get('config'),
          port: Number(ctx.get('config').port),
          listenhost: ctx.get('config').hostname,
          subscriptionEndpoint: 'wss://bsky.network',
          subscriptionReconnectDelay: 3000,
        },
      },
      {
        feed,
        limit: Number(ctx.req.query('limit')) || 50,
        cursor: ctx.req.query('cursor'),
      },
      requesterDid,
    );
    console.info(`generated algo=${feedUri.rkey} response=${JSON.stringify(response)}`);
    void db
      .transaction()
      .execute(async (trx) => {
        const feedStats = await trx
          .selectFrom('feed_stats')
          .selectAll()
          .where('feed', '=', feedUri.rkey)
          .where('user', '=', requesterDid || 'guest')
          .execute();

        if (feedStats.length === 0) {
          await trx
            .insertInto('feed_stats')
            .values({ feed: feedUri.rkey, fetches: 1, user: requesterDid || 'guest' })
            .execute();
        } else {
          await trx
            .updateTable('feed_stats')
            .where('feed', '=', feedUri.rkey)
            .where('user', '=', requesterDid || 'guest')
            .set((eb) => ({
              fetches: eb('fetches', '+', 1),
            }))
            .execute();
        }
      })
      .catch((error) => {
        {
          console.error(`Error updating feed stats`, String(error));
        }
      });
    return ctx.json(response);
  } catch (error) {
    console.error(`Error in feed generation`, String(error));
    return ctx.json({
      feed: [],
    });
  }
});

// Health check endpoint
app.get('/health', (ctx) => ctx.text('OK'));

// Well-known DID configuration
app.get('/.well-known/did.json', (ctx) => {
  return ctx.json({
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: config.serviceDid,
    service: [
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: `https://${config.hostname}`,
      },
    ],
  });
});

const main = async () => {
  await migrateToLatest(db);

  // Start the web server
  serve(app, (info) => {
    console.log(`🤖 running feed generator at http://${info.address}:${info.port}`);
  });

  // start the feed generators
  for (const [algoName, algo] of Object.entries(algos)) {
    // first run
    await algo
      .generator?.({
        db,
        config: {
          ...config,
          port: Number(config.port),
          listenhost: config.hostname,
          subscriptionEndpoint: 'wss://bsky.network',
          subscriptionReconnectDelay: 3000,
        },
      })
      .catch((error) => {
        console.error(`Error running generator for algo=${algoName}`, error);
      });

    // then run every 10 minutes
    setInterval(async () => {
      await algo
        .generator?.({
          db,
          config: {
            ...config,
            port: Number(config.port),
            listenhost: config.hostname,
            subscriptionEndpoint: 'wss://bsky.network',
            subscriptionReconnectDelay: 3000,
          },
        })
        .catch((error) => {
          console.error(`Error running generator for algo=${algoName}`, error);
        });
    }, 60 * 10 * 1_000);
  }

  // start the firehose
  jetstream.start();
};

main().catch((error) => {
  console.error('Error starting feed generator', error);
  process.exit(1);
});
