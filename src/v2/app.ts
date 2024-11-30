import { Hono, HonoRequest } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { AtUri } from '@atproto/syntax';
import { AuthRequiredError, InvalidRequestError, verifyJwt } from '@atproto/xrpc-server';
import algos from '../algos';
import { DidResolver, MemoryCache } from '@atproto/identity';
import { Database } from '../db';
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

// Feed Skeleton endpoint
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', async (ctx) => {
  try {
    // Validate the feed parameter
    const feed = ctx.req.query('feed');
    if (!feed) throw new InvalidRequestError('Missing feed parameter', 'MissingFeed');

    console.info(`generating feed=${feed} query=${JSON.stringify(ctx.req.query())}`);

    // Parse the feed URI
    const feedUri = new AtUri(feed);

    // Check if the feed algorithm is supported
    const algo = algos[feedUri.rkey].handler;
    if (!algo) throw new InvalidRequestError('Unsupported algorithm', 'UnsupportedAlgorithm');

    // Only check auth if the algorithm requires it
    const requiresAuth = algos[feedUri.rkey].requiresAuth;
    const requesterDid = requiresAuth ? await validateAuth(ctx.req) : undefined;

    // Generate the feed
    const response = await algo(
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
    console.info(`generated feed=${feed} response=${JSON.stringify(response)}`);
    return ctx.json(response);
  } catch (error) {
    console.error(`Error in feed generation`, JSON.stringify(error));
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

// Start the feed generator
serve(app, (info) => {
  console.log(`🤖 running feed generator at http://${info.address}:${info.port}`);

  // start the firehose
  jetstream.start();
});
