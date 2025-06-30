import { Hono, HonoRequest } from 'hono';
import { cors } from 'hono/cors';
import { AtUri } from '@atproto/syntax';
import { AuthRequiredError, InvalidRequestError, verifyJwt } from '@atproto/xrpc-server';
import algos from './algos';
import { DidResolver, MemoryCache } from '@atproto/identity';
import { Database, db } from './db';
import { config } from './config';

const withLogging = async <T>(path: string, fn: () => T): Promise<T> => {
  try {
    const startTime = performance.now();
    const result = await Promise.resolve(fn());

    try {
      return result;
    } finally {
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Convert bytes to human-friendly format
      const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
      };

      // Format duration with microsecond precision
      const formatDuration = (ms: number): string => {
        if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
        if (ms < 1000) return `${ms.toFixed(2)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
      };

      const responseSize = typeof result === 'string' ? Buffer.byteLength(result, 'utf8') : 0;

      // Fixed-width columns: path (25 chars), duration (12 chars), size (10 chars)
      const pathColumn = path.length > 25 ? path.substring(0, 22) + '...' : path.padEnd(25);
      const durationColumn = formatDuration(duration).padStart(12);
      const sizeColumn = formatBytes(responseSize).padStart(10);

      console.log(`${pathColumn} | Duration: ${durationColumn} | Response size: ${sizeColumn}`);
    }
  } catch (e) {
    console.error(`${path} | Error: ${e instanceof Error ? e.message : String(e)}`);
    throw new Response('Internal Server Error', { status: 500 });
  }
};

const createAppWrapper = (html: string) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Feed Generator Stats</title>
      <style>body{font-family:'Courier New',monospace;font-size:.9rem;background-color:#121212;color:#e0e0e0;line-height:1.4;margin:2rem}a:link{color:#55cdfc;text-decoration:none}a:visited{color:#f7a8b8}a:hover{color:#b19cd9;text-decoration:underline}h1,h2{color:#b19cd9;margin-bottom:1rem}</style>
      <script defer data-domain="feeds.imlunahey.com" src="https://plausible.io/js/script.js"></script>
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

// Enable CORS
app.use('/*', cors());

app.get('/', async (ctx) => {
  return withLogging('/', async () => {
    return ctx.html(
      createAppWrapper(`
    <h1>Feed Generator</h1>
    <p>Checkout the <a href="/stats">stats</a> page for some fun data.</p>
  `),
    );
  });
});

app.get('/stats', async (ctx) => {
  return withLogging('/stats', async () => {
    return ctx.html(
      createAppWrapper(`
    <h1>Feed Generator Stats</h1>
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
});

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

app.get('/stats/accounts/json', async (ctx) => {
  return withLogging('/stats/accounts/json', async () => {
    const accountStats = await db
      .selectFrom('post')
      .select('author')
      .select(db.fn.sum('likes').as('likeCount'))
      .select(db.fn.sum('replies').as('replyCount'))
      .groupBy('author')
      .execute();

    const stats = accountStats.reduce((acc, stat) => {
      acc[stat.author] = {
        likeCount: Number(stat.likeCount) || 0,
        replyCount: Number(stat.replyCount) || 0,
      };
      return acc;
    }, {} as Record<string, { likeCount: number; replyCount: number }>);

    return ctx.json(stats);
  });
});

app.get('/stats/accounts', async (ctx) => {
  return withLogging('/stats/accounts', async () => {
    const accountStats = await db
      .selectFrom('post')
      .select('author')
      .select(db.fn.sum('likes').as('likeCount'))
      .select(db.fn.sum('replies').as('replyCount'))
      .groupBy('author')
      .execute();

    const stats = accountStats.reduce((acc, stat) => {
      acc[stat.author] = {
        likeCount: Number(stat.likeCount) || 0,
        replyCount: Number(stat.replyCount) || 0,
      };
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
    ).sort(([, a], [, b]) => b - a)[0]?.[0];

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
});

app.get('/stats/feeds/json', async (ctx) => {
  return withLogging('/stats/feeds/json', async () => {
    const feedStats = await db
      .selectFrom('feed_stats')
      .select('feed')
      .select(db.fn.sum('fetches').as('totalFetches'))
      .groupBy('feed')
      .execute();

    const stats = feedStats.reduce((acc, stat) => {
      acc[stat.feed] = Number(stat.totalFetches) || 0;
      return acc;
    }, {} as Record<string, number>);

    // sort the fields alphabetically so that sub feeds are grouped together
    const sorted = Object.fromEntries(Object.entries(stats).sort(([a], [b]) => a.localeCompare(b)));
    return ctx.json(sorted);
  });
});

app.get('/stats/feeds', async (ctx) => {
  return withLogging('/stats/feeds', async () => {
    const feedStats = await db
      .selectFrom('feed_stats')
      .select('feed')
      .select(db.fn.sum('fetches').as('totalFetches'))
      .groupBy('feed')
      .execute();

    const stats = feedStats.reduce((acc, stat) => {
      acc[stat.feed] = Number(stat.totalFetches) || 0;
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
});

app.get('/stats/tags/json', async (ctx) => {
  return withLogging('/stats/tags/json', async () => {
    const feedStats = await db.selectFrom('post').select('tags').where('tags', '!=', '').execute();

    const stats = feedStats.reduce((acc, stat) => {
      const tags = stat.tags.split(',');
      for (const tag_ of tags) {
        const tag = tag_.trim().toLowerCase();
        if (tag) {
          if (!acc[tag]) {
            acc[tag] = 0;
          }
          acc[tag] += 1;
        }
      }
      return acc;
    }, {} as Record<string, number>);

    // sort by tag count
    const sorted = Object.fromEntries(Object.entries(stats).sort(([, a], [, b]) => b - a));
    return ctx.json(sorted);
  });
});

app.get('/stats/tags', async (ctx) => {
  return withLogging('/stats/tags', async () => {
    const feedStats = await db.selectFrom('post').select('tags').where('tags', '!=', '').execute();

    const stats = feedStats.reduce((acc, stat) => {
      const tags = stat.tags.split(',');
      for (const tag_ of tags) {
        const tag = tag_.trim().toLowerCase();
        if (tag) {
          if (!acc[tag]) {
            acc[tag] = 0;
          }
          acc[tag] += 1;
        }
      }
      return acc;
    }, {} as Record<string, number>);

    // sort by tag count
    const sorted = Object.entries(stats)
      .filter(([tag, count]) => count > 1)
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
});

app.get('/stats/domains/json', async (ctx) => {
  return withLogging('/stats/domains/json', async () => {
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
});

app.get('/stats/domains', async (ctx) => {
  return withLogging('/stats/domains', async () => {
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
});

app.get('/stats/links/json', async (ctx) => {
  return withLogging('/stats/links/json', async () => {
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
});

app.get('/stats/links', async (ctx) => {
  return withLogging('/stats/links', async () => {
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
});

app.get('/stats/pinned/json', async (ctx) => {
  return withLogging('/stats/pinned/json', async () => {
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
});

app.get('/stats/pinned', async (ctx) => {
  return withLogging('/stats/pinned', async () => {
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
});

app.get('/stats/blocks/json', async (ctx) => {
  return withLogging('/stats/blocks/json', async () => {
    // how many blocks each user has
    const blocks = await db
      .selectFrom('blocks')
      .select(['blocker', db.fn.count('blocker').as('blockCount')])
      .groupBy('blocker')
      .orderBy('blockCount', 'desc')
      .limit(100)
      .execute();

    // how many times a user has been blocked
    const blocked = await db
      .selectFrom('blocks')
      .select(['blocked', db.fn.count('blocked').as('blockedCount')])
      .groupBy('blocked')
      .orderBy('blockedCount', 'desc')
      .limit(100)
      .execute();

    return ctx.json({ blocks, blocked });
  });
});

app.get('/stats/blocks', async (ctx) => {
  return withLogging('/stats/blocks', async () => {
    // how many blocks each user has
    const blockerStats = await db
      .selectFrom('blocks')
      .select(['blocker', db.fn.count('blocker').as('blockCount')])
      .groupBy('blocker')
      .orderBy('blockCount', 'desc')
      .limit(100)
      .execute();

    // how many times a user has been blocked
    const blockedStats = await db
      .selectFrom('blocks')
      .select(['blocked', db.fn.count('blocked').as('blockedCount')])
      .groupBy('blocked')
      .orderBy('blockedCount', 'desc')
      .limit(100)
      .execute();

    const blockerHandles = await Promise.allSettled(
      blockerStats.map(async ({ blocker }) => didResolver.resolve(blocker)),
    ).then((results) => results.map((result) => (result.status === 'fulfilled' ? result.value : undefined)));

    const blockedHandles = await Promise.allSettled(
      blockedStats.map(async ({ blocked }) => didResolver.resolve(blocked)),
    ).then((results) => results.map((result) => (result.status === 'fulfilled' ? result.value : undefined)));

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
          ({ blocker, blockCount }, index) =>
            `<li><a href="https://bsky.app/profile/${blocker}">@${
              blockerHandles[index]?.alsoKnownAs?.[0].split('//')[1] ?? blocker
            }</a> has blocked ${blockCount} users</li>`,
        )
        .join('')}
    </ol>

    <h2>Blocked Stats</h2>
    <p>Top 100 blocked users in the last hour</p>
    <ol>
      ${blockedStats
        .map(
          ({ blocked, blockedCount }, index) =>
            `<li><a href="https://bsky.app/profile/${blocked}">@${
              blockedHandles[index]?.alsoKnownAs?.[0].split('//')[1] ?? blocked
            }</a> has been blocked ${blockedCount} times</li>`,
        )
        .join('')}
    </ol>
  `),
    );
  });
});

app.get('/stats/follows/json', async (ctx) => {
  return withLogging('/stats/follows/json', async () => {
    // how many follows each user has
    const follows = await db
      .selectFrom('follows')
      .select(['follower', db.fn.count('follower').as('followCount')])
      .groupBy('follower')
      .orderBy('followCount', 'desc')
      .limit(100)
      .execute();

    // how many times a user has been followed
    const followed = await db
      .selectFrom('follows')
      .select(['followed', db.fn.count('followed').as('followedCount')])
      .groupBy('followed')
      .orderBy('followedCount', 'desc')
      .limit(100)
      .execute();

    return ctx.json({ follows, followed });
  });
});

app.get('/stats/follows', async (ctx) => {
  return withLogging('/stats/follows', async () => {
    // how many follows each user has
    const followerStats = await db
      .selectFrom('follows')
      .select(['follower', db.fn.count('follower').as('followCount')])
      .groupBy('follower')
      .orderBy('followCount', 'desc')
      .limit(100)
      .execute();

    // how many times a user has been followed
    const followedStats = await db
      .selectFrom('follows')
      .select(['followed', db.fn.count('followed').as('followedCount')])
      .groupBy('followed')
      .orderBy('followedCount', 'desc')
      .limit(100)
      .execute();

    const followerHandles = await Promise.allSettled(
      followerStats.map(async ({ follower }) => didResolver.resolve(follower)),
    ).then((results) => results.map((result) => (result.status === 'fulfilled' ? result.value : undefined)));

    const followedHandles = await Promise.allSettled(
      followedStats.map(async ({ followed }) => didResolver.resolve(followed)),
    ).then((results) => results.map((result) => (result.status === 'fulfilled' ? result.value : undefined)));

    return ctx.html(
      createAppWrapper(`
    <a href="/stats">&lt; go back</a>
    <h1>Follow Stats</h1>
    <p>See raw data at <a href="/stats/follows/json">/stats/follows/json</a></p>

    <h2>Follow Stats</h2>
    <p>Top 100 followers in the last hour</p>
    <ol>
      ${followerStats
        .map(
          ({ follower, followCount }, index) =>
            `<li><a href="https://bsky.app/profile/${follower}">@${
              followerHandles[index]?.alsoKnownAs?.[0].split('//')[1] ?? follower
            }</a> has followed ${followCount} users</li>`,
        )
        .join('')}
    </ol>

    <h2>Followed Stats</h2>
    <p>Top 100 followed users in the last hour</p>
    <ol>
      ${followedStats
        .map(
          ({ followed, followedCount }, index) =>
            `<li><a href="https://bsky.app/profile/${followed}">@${
              followedHandles[index]?.alsoKnownAs?.[0].split('//')[1] ?? followed
            }</a> has been followed ${followedCount} times</li>`,
        )
        .join('')}
    </ol>
  `),
    );
  });
});

// Feed Skeleton endpoint
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', async (ctx) => {
  return withLogging('/xrpc/app.bsky.feed.getFeedSkeleton', async () => {
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
});

export default app;
