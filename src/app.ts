import { Hono, HonoRequest } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { AtUri } from '@atproto/syntax';
import { AuthRequiredError, InvalidRequestError, verifyJwt } from '@atproto/xrpc-server';
import algos from './algos';
import { DidResolver, MemoryCache } from '@atproto/identity';
import { Database, migrateToLatest, db } from './db';
import { config } from './config';
import { jetstream } from './firehose';

const createAppWrapper = (html: string) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Feed Generator Stats</title>
      <style>body{font-family:'Courier New',monospace;font-size:.9rem;background-color:#121212;color:#e0e0e0;line-height:1.4;margin:2rem}a:link{color:#55cdfc;text-decoration:none}a:visited{color:#f7a8b8}a:hover{color:#b19cd9;text-decoration:underline}h1,h2{color:#b19cd9;margin-bottom:1rem}</style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;
};

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
  return ctx.html(
    createAppWrapper(`
    <h1>Feed Generator Stats</hjson>
    <ul>
      <li><a href="/stats/feeds">Feeds</a></li>
      <li><a href="/stats/tags">Tags</a></li>
      <li><a href="/stats/accounts">Accounts</a></li>
      <li><a href="/stats/domains">Domains</a></li>
      <li><a href="/stats/links">Links</a></li>
      <li><a href="/stats/pinned">Pinned Posts</a></li>
    </ul>
  `),
  );
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

  // get the top 1k accounts by total likes and replies
  const sorted = Object.entries(stats)
    .sort(([, { likeCount: aLikes, replyCount: aReplies }], [, { likeCount: bLikes, replyCount: bReplies }]) => {
      const aTotal = aLikes + aReplies;
      const bTotal = bLikes + bReplies;
      return bTotal - aTotal;
    })
    .slice(0, 1_000);

  const handles = await Promise.allSettled(sorted.map(async ([did]) => didResolver.resolve(did))).then((results) =>
    results.map((result) => (result.status === 'fulfilled' ? result.value : undefined)),
  );

  const mostCommonTld = Object.entries(
    handles.reduce((acc, handle) => {
      if (handle?.alsoKnownAs?.[0].endsWith('.bsky.social')) {
        return acc;
      }
      const tld = handle?.alsoKnownAs?.[0].split('.').slice(-1)[0];
      if (!tld) {
        return acc;
      }

      if (!acc[tld]) {
        acc[tld] = 0;
      }
      acc[tld] += 1;
      return acc;
    }, {} as Record<string, number>),
  ).sort(([, a], [, b]) => b - a)[0][0];

  return ctx.html(
    createAppWrapper(`
    <a href="/stats">&lt; go back</a>
    <h1>Account Stats</h1>
    <p>See raw data at <a href="/stats/accounts/json">/stats/accounts/json</a></p>

    <p>Out of the top 1k accounts only ${
      handles.filter((handle) => !handle?.alsoKnownAs?.[0].endsWith('.bsky.social')).length
    } have a custom domain set, the most common tld is ${mostCommonTld}</p>

    <h2>Top 1k accounts with posts within the last hour by total likes and replies</h2>
    <ol>
      ${sorted
        .map(
          ([did, { likeCount, replyCount }], index) =>
            `<li><a href="https://bsky.app/profile/${handles[index]?.alsoKnownAs?.[0].split('//')[1] ?? did}">${
              handles[index]?.alsoKnownAs?.[0].split('//')[1] ? `@${handles[index]?.alsoKnownAs?.[0].split('//')[1]}` : did
            }</a> Likes: ${likeCount}, Replies: ${replyCount}</li>`,
        )
        .join('')}
    </ol>
  `),
  );
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

  return ctx.html(
    createAppWrapper(`
    <a href="/stats">&lt; go back</a>
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
  `),
  );
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

  return ctx.html(
    createAppWrapper(`
    <a href="/stats">&lt; go back</a>
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
    <ol>
      ${sorted
        .map(
          ([tag, count]) => `<li><a href="https://bsky.app/hashtag/${encodeURIComponent(tag)}">${tag}</a> (${count})</li>`,
        )
        .join('')}
    </ol>
    `),
  );
});

app.get('/stats/domains/json', async (ctx) => {
  const postLinks = await db.selectFrom('post').select('links').where('links', '!=', '').execute();
  const domains = postLinks.reduce((acc, stat) => {
    const links = stat.links.split(',');
    for (const link of links) {
      try {
        const url = new URL(link.trim());
        if (!acc[url.hostname]) {
          acc[url.hostname] = 0;
        }
        acc[url.hostname] += 1;
      } catch {}
    }
    return acc;
  }, {} as Record<string, number>);

  // sort by link count
  const sorted = Object.fromEntries(Object.entries(domains).sort(([, a], [, b]) => b - a));
  return ctx.json(sorted);
});

app.get('/stats/domains', async (ctx) => {
  const postLinks = await db.selectFrom('post').select('links').where('links', '!=', '').execute();
  const domains = postLinks.reduce((acc, stat) => {
    const links = stat.links.split(',');
    for (const link of links) {
      try {
        const url = new URL(link.trim());
        if (!acc[url.hostname]) {
          acc[url.hostname] = 0;
        }
        acc[url.hostname] += 1;
      } catch {}
    }
    return acc;
  }, {} as Record<string, number>);

  // sort by link count
  const sorted = Object.entries(domains).sort(([, a], [, b]) => b - a);

  return ctx.html(
    createAppWrapper(`
    <a href="/stats">&lt; go back</a>
    <h1>Domain Stats</h1>
    <p>See raw data at <a href="/stats/domains/json">/stats/domains/json</a></p>

    <h2>Domains with more than 1 post</h2>
    <ol>
      ${sorted.map(([domain, count]) => `<li><a href="http://${domain}">${domain}</a> (${count})</li>`).join('')}
    </ol>
  `),
  );
});

app.get('/stats/links/json', async (ctx) => {
  const postLinks = await db.selectFrom('post').select('links').where('links', '!=', '').execute();
  const links = postLinks.reduce((acc, stat) => {
    const links_ = stat.links.split(',');
    for (const link of links_) {
      try {
        const url = new URL(link.trim());
        if (!acc[url.href]) {
          acc[url.href] = 0;
        }
        acc[url.href] += 1;
      } catch {}
    }
    return acc;
  }, {} as Record<string, number>);

  // sort by link count
  const sorted = Object.fromEntries(Object.entries(links).sort(([, a], [, b]) => b - a));
  return ctx.json(sorted);
});

app.get('/stats/links', async (ctx) => {
  const postLinks = await db.selectFrom('post').select('links').where('links', '!=', '').execute();
  const links = postLinks.reduce((acc, stat) => {
    const links_ = stat.links.split(',');
    for (const link of links_) {
      try {
        const url = new URL(link.trim());
        if (!acc[url.href]) {
          acc[url.href] = 0;
        }
        acc[url.href] += 1;
      } catch {}
    }
    return acc;
  }, {} as Record<string, number>);

  // sort by link count
  const sorted = Object.entries(links).sort(([, a], [, b]) => b - a);

  return ctx.html(
    createAppWrapper(`
    <a href="/stats">&lt; go back</a>
    <h1>Link Stats</h1>
    <p>See raw data at <a href="/stats/links/json">/stats/links/json</a></p>

    <h2>Links with more than 1 post</h2>
    <ol>
      ${sorted.map(([link, count]) => `<li><a href="${link}">${link}</a> (${count})</li>`).join('')}
    </ol>
  `),
  );
});

app.get('/stats/pinned/json', async (ctx) => {
  const pinnedStats = await db
    .selectFrom('post')
    .select('rootPostUri')
    .select('cid')
    .where('rootPostUri', '!=', '')
    .where('text', 'like', '%📌%')
    .execute();

  const stats = pinnedStats.reduce((acc, stat) => {
    if (!acc[stat.rootPostUri]) {
      acc[stat.rootPostUri] = 0;
    }
    acc[stat.rootPostUri] += 1;
    return acc;
  }, {} as Record<string, number>);

  return ctx.json(stats);
});

app.get('/stats/pinned', async (ctx) => {
  const pinnedStats = await db
    .selectFrom('post')
    .select('rootPostUri')
    .select('cid')
    .where('rootPostUri', '!=', '')
    .where('text', 'like', '%📌%')
    .execute();

  const stats = pinnedStats.reduce((acc, stat) => {
    if (!acc[stat.rootPostUri]) {
      acc[stat.rootPostUri] = 0;
    }
    acc[stat.rootPostUri] += 1;
    return acc;
  }, {} as Record<string, number>);

  // sort by post count
  const sorted = Object.entries(stats).sort(([, a], [, b]) => b - a);

  const handles = await Promise.allSettled(
    sorted.map(async ([postUri]) => didResolver.resolve(postUri.split('//')[1].split('/')[0])),
  ).then((results) => results.map((result) => (result.status === 'fulfilled' ? result.value : undefined)));

  return ctx.html(
    createAppWrapper(`
    <a href="/stats">&lt; go back</a>
    <h1>Pinned Post Stats</h1>
    <p>See raw data at <a href="/stats/pinned/json">/stats/pinned/json</a></p>

    <h2>Posts with more than 1 pin</h2>
    <ol>
      ${sorted
        .map(([postUri, count], index) => {
          const rKey = postUri.split('//')[1].split('/')[2];
          const handle = handles[index]?.alsoKnownAs?.[0].split('//')[1] ?? postUri.split('//')[1].split('/')[0];
          return `<li><a href="https://bsky.app/profile/${handle}/post/${rKey}">@${handle}/${rKey}</a> (${count})</li>`;
        })
        .join('')}
    </ol>
  `),
  );
});

app.get('/stats/blocks/json', async (ctx) => {
  // how many blocks each user has
  const blocks = await db
    .selectFrom('block')
    .select(['blocker', db.fn.count('blocker').as('blockCount')])
    .groupBy('blocker')
    .orderBy('blockCount', 'desc')
    .limit(100)
    .execute();

  // how many times a user has been blocked
  const blocked = await db
    .selectFrom('block')
    .select(['blocked', db.fn.count('blocked').as('blockedCount')])
    .groupBy('blocked')
    .orderBy('blockedCount', 'desc')
    .limit(100)
    .execute();

  return ctx.json({ blocks, blocked });
});

app.get('/stats/blocks', async (ctx) => {
  // how many blocks each user has
  const blockerStats = await db
    .selectFrom('block')
    .select(['blocker', db.fn.count('blocker').as('blockCount')])
    .groupBy('blocker')
    .orderBy('blockCount', 'desc')
    .limit(100)
    .execute();

  // how many times a user has been blocked
  const blockedStats = await db
    .selectFrom('block')
    .select(['blocked', db.fn.count('blocked').as('blockedCount')])
    .groupBy('blocked')
    .orderBy('blockedCount', 'desc')
    .limit(100)
    .execute();

  return ctx.html(
    createAppWrapper(`
    <a href="/stats">&lt; go back</a>
    <h1>Block Stats</h1>
    <p>See raw data at <a href="/stats/blocks/json">/stats/blocks/json</a></p>

    <h2>Block Stats</h2>
    <p>Top 100 blockers in the last hour</p>
    <ol>
      ${blockerStats
        .map(
          ({ blocker, blockCount }) =>
            `<li><a href="https://bsky.app/profile/${blocker}">${blocker}</a> has blocked ${blockCount} users</li>`,
        )
        .join('')}
    </ol>

    <h2>Blocked Stats</h2>
    <p>Top 100 blocked users in the last hour</p>
    <ol>
      ${blockedStats
        .map(
          ({ blocked, blockedCount }) =>
            `<li><a href="https://bsky.app/profile/${blocked}">${blocked}</a> has been blocked ${blockedCount} times</li>`,
        )
        .join('')}
    </ol>
  `),
  );
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
