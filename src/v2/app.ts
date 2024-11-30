import { Hono, HonoRequest } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { AtUri } from '@atproto/syntax';
import { AuthRequiredError, InvalidRequestError, verifyJwt } from '@atproto/xrpc-server';
import algos from '../algos';
import { DidResolver, MemoryCache } from '@atproto/identity';

const app = new Hono();

const config = {
  hostname: process.env.FEEDGEN_HOSTNAME || 'example.com',
  serviceDid: process.env.FEEDGEN_SERVICE_DID || `did:web:${process.env.FEEDGEN_HOSTNAME}`,
  port: process.env.FEEDGEN_PORT || 3000,
  sqliteLocation: process.env.FEEDGEN_SQLITE_LOCATION || ':memory:',
  publisherDid: process.env.FEEDGEN_PUBLISHER_DID || 'did:example:alice',
};

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
  const originalUrl = req.url || '/';
  const nsid_ = originalUrl.split('?')[0].replace('/xrpc/', '');
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

    // Parse the feed URI
    const feedUri = new AtUri(feed);

    // Check if the feed algorithm is supported
    const algo = algos[feedUri.rkey].handler;
    if (!algo) throw new InvalidRequestError('Unsupported algorithm', 'UnsupportedAlgorithm');

    // Only check auth if the algorithm requires it
    const requiresAuth = algos[feedUri.rkey].requiresAuth;
    const requesterDid = requiresAuth ? await validateAuth(ctx.req) : undefined;

    console.info(`feed=${feedUri.rkey} requesterDid=${requesterDid ?? 'unknown'} query=${JSON.stringify(ctx.req.query())}`);

    // @TODO: Implement the actual feed generation
    // const response = await algo(ctx, params, requesterDid);
    // return ctx.json(response);

    // for now return a static feed
    return ctx.json({
      cursor: undefined,
      feed: [
        {
          post: 'at://did:plc:k6acu4chiwkixvdedcmdgmal/app.bsky.feed.post/3lc364tfdhk2l',
        },
      ],
    });
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

// Start the server
serve(app, (info) => {
  console.log(`🤖 running feed generator at http://${info.address}:${info.port}`);
});
