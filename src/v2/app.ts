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
  return ctx.html(`
    <h1>Feed Generator Stats</hjson>
    <ul>
      <li><a href="/stats/feeds">Feeds</a></li>
      <li><a href="/stats/tags">Tags</a></li>
    </ul>
  `);
});

app.get('/stats/accounts/json', async (ctx) => {
  const accountStats = await db
    .selectFrom('post')
    .select('author')
    .select('likes as likeCount')
    .select('replies as replyCount')
    .execute();

  const stats = accountStats.reduce((acc, stat) => {
    if (!acc[stat.author]) {
      acc[stat.author] = { likeCount: 0, replyCount: 0 };
    }
    acc[stat.author].likeCount += stat.likeCount;
    acc[stat.author].replyCount += stat.replyCount;
    return acc;
  }, {} as Record<string, { likeCount: number; replyCount: number }>);
  return ctx.json(stats);
});

app.get('/stats/accounts', async (ctx) => {
  const accountStats = await db
    .selectFrom('post')
    .select('author')
    .select('likes as likeCount')
    .select('replies as replyCount')
    .execute();

  const stats = accountStats.reduce((acc, stat) => {
    if (!acc[stat.author]) {
      acc[stat.author] = { likeCount: 0, replyCount: 0 };
    }
    acc[stat.author].likeCount += stat.likeCount;
    acc[stat.author].replyCount += stat.replyCount;
    return acc;
  }, {} as Record<string, { likeCount: number; replyCount: number }>);

  // get the top 10% of accounts
  const sorted = Object.entries(stats)
    .sort(([, { likeCount: aLikes, replyCount: aReplies }], [, { likeCount: bLikes, replyCount: bReplies }]) => {
      const aTotal = aLikes + aReplies;
      const bTotal = bLikes + bReplies;
      return bTotal - aTotal;
    })
    .slice(0, Math.ceil(Object.keys(stats).length * 0.1));

  return ctx.html(`
    <h1>Account Stats</h1>
    <p>See raw data at <a href="/stats/accounts/json">/stats/accounts/json</a></p>

    <h2>Accounts with more than 1 like or reply</h2>
    <ul>
      ${sorted.map(
        ([author, { likeCount, replyCount }]) =>
          `<li><a href="https://bsky.app/profile/${author}">${author}</a> Likes: ${likeCount}, Replies: ${replyCount}</li>`,
      )}
    </ul>
  `);
});

app.get('/stats/feeds/json', async (ctx) => {
  const feedStats = await db.selectFrom('feed_stats').select('fetches').select('feed').execute();
  const stats = feedStats.reduce((acc, stat) => {
    if (!acc[stat.feed]) {
      acc[stat.feed] = 0;
    }
    acc[stat.feed] += stat.fetches;
    return acc;
  }, {} as Record<string, number>);
  // sort the fields alphabetically so that sub feeds are grouped together
  const sorted = Object.fromEntries(Object.entries(stats).sort(([a], [b]) => a.localeCompare(b)));
  return ctx.json(sorted);
});

app.get('/stats/feeds', async (ctx) => {
  const feedStats = await db.selectFrom('feed_stats').select('fetches').select('feed').execute();
  const stats = feedStats.reduce((acc, stat) => {
    if (!acc[stat.feed]) {
      acc[stat.feed] = 0;
    }
    acc[stat.feed] += stat.fetches;
    return acc;
  }, {} as Record<string, number>);
  // sort the fields alphabetically so that sub feeds are grouped together
  const sorted = Object.fromEntries(Object.entries(stats).sort(([a], [b]) => a.localeCompare(b)));

  return ctx.html(`
    <h1>Feed Stats</h1>
    <p>See raw data at <a href="/stats/feeds/json">/stats/feeds/json</a></p>

    <h2>Feeds run by luna</h2>
    <ul>
      ${Object.entries(sorted)
        .map(
          ([feed, count]) => `<li><a href="https://bsky.app/profile/imlunahey.com/feed/${feed}">${feed}</a> (${count})</li>`,
        )
        .join('')}
    </ul>
  `);
});

app.get('/stats/tags/json', async (ctx) => {
  const feedStats = await db.selectFrom('post').select('tags').execute();
  const stats = feedStats.reduce((acc, stat) => {
    const tags = stat.tags.split(',');
    for (const tag_ of tags) {
      const tag = tag_.trim().toLowerCase();
      if (!acc[tag]) {
        acc[tag] = 0;
      }
      acc[tag] += 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // sort by tag count
  const sorted = Object.fromEntries(Object.entries(stats).sort(([, a], [, b]) => b - a));
  return ctx.json(sorted);
});

app.get('/stats/tags', async (ctx) => {
  const feedStats = await db.selectFrom('post').select('tags').execute();
  const stats = feedStats.reduce((acc, stat) => {
    const tags = stat.tags.split(',');
    for (const tag_ of tags) {
      const tag = tag_.trim().toLowerCase();
      if (!acc[tag]) {
        acc[tag] = 0;
      }
      acc[tag] += 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // sort by tag count
  const sorted = Object.entries(stats)
    .filter(([tag, count]) => count > 1 && tag !== '[object Object]' && tag !== '')
    .sort(([tagA, countA], [tagB, countB]) => countB - countA);

  return ctx.html(`
    <h1>Tag Stats</h1>
    <p>See raw data at <a href="/stats/tags/json">/stats/tags/json</a></p>

    <h2>Tags ending in sky</h2>
    <ul>
      ${sorted
        .filter(([tag]) => tag.toLowerCase().endsWith('sky'))
        .map(
          ([tag, count]) => `<li><a href="https://bsky.app/hashtag/${encodeURIComponent(tag)}">${tag}</a> (${count})</li>`,
        )
        .join('')}
    </ul>

    <h2>Tags with more than 1 post</h2>
    <ul>
      ${sorted
        .map(
          ([tag, count]) => `<li><a href="https://bsky.app/hashtag/${encodeURIComponent(tag)}">${tag}</a> (${count})</li>`,
        )
        .join('')}
    </ul>
    `);
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
