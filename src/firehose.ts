import { Jetstream } from '@skyware/jetstream';
import { db } from './db';

export const jetstream = new Jetstream({
  wantedCollections: [
    'app.bsky.feed.post',
    'app.bsky.feed.like',
    'app.bsky.feed.repost',
    'app.bsky.graph.block',
    'app.bsky.graph.follow',
  ], // omit to receive all collections
  wantedDids: [],
});

jetstream.onCreate('app.bsky.feed.post', async (event) => {
  const tags =
    event.commit.record.facets
      ?.filter((facet) => facet.features[0].$type === 'app.bsky.richtext.facet#tag')
      .map((facet) => {
        const feature = facet.features[0] as { $type: 'app.bsky.richtext.facet#tag'; tag: string };
        return feature.tag;
      }) ?? [];

  const links =
    event.commit.record.facets
      ?.filter((facet) => facet.features[0].$type === 'app.bsky.richtext.facet#link')
      .map((facet) => {
        const feature = facet.features[0] as { $type: 'app.bsky.richtext.facet#link'; uri: string };
        return feature.uri;
      }) ?? [];

  await db
    .insertInto('post')
    .values({
      author: event.did,
      uri: `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`,
      cid: event.commit.cid,
      text: event.commit.record.text,
      langs: event.commit.record.langs?.join(',') ?? '',
      likes: 0,
      replies: 0,
      labels: event.commit.record.labels?.values?.map((label) => label.val).join(',') ?? '',
      hasImage: event.commit.record.embed?.$type === 'app.bsky.embed.images' ? 1 : 0,
      altText:
        event.commit.record.embed &&
        'images' in event.commit.record.embed &&
        event.commit.record.embed.images.some((image) => image.alt)
          ? JSON.stringify(event.commit.record.embed.images.map((image) => image.alt))
          : '',
      embedUrl: event.commit.record.embed?.$type === 'app.bsky.embed.external' ? event.commit.record.embed.external.uri : '',
      links: links.join(',') ?? '',
      tags: tags.join(',') ?? '',
      indexedAt: new Date().toISOString(),
      rootPostUri: event.commit.record.reply?.root?.uri ?? '',
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
});

jetstream.onDelete('app.bsky.feed.post', async (event) => {
  await db.deleteFrom('post').where('uri', '=', event.commit.rkey).execute();
});

jetstream.onCreate('app.bsky.feed.like', async (event) => {
  await db
    .updateTable('post')
    .set((eb) => ({
      likes: eb('likes', '+', 1),
    }))
    .where('uri', '=', event.commit.record.subject.uri)
    .execute();
});

jetstream.onCreate('app.bsky.feed.repost', async (event) => {
  await db
    .updateTable('post')
    .set((eb) => ({
      replies: eb('replies', '+', 1),
    }))
    .where('uri', '=', event.commit.record.subject.uri)
    .execute();
});

jetstream.onCreate('app.bsky.graph.block', async (event) => {
  await db
    .insertInto('blocks')
    .values({
      id: event.commit.rkey,
      blocker: event.did,
      blocked: event.commit.record.subject,
      createdAt: new Date().toISOString(),
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
});

jetstream.onDelete('app.bsky.graph.block', async (event) => {
  await db.deleteFrom('blocks').where('id', '=', event.commit.rkey).execute();
});

jetstream.onCreate('app.bsky.graph.follow', async (event) => {
  await db
    .insertInto('follows')
    .values({
      id: event.commit.rkey,
      follower: event.did,
      followed: event.commit.record.subject,
      createdAt: new Date().toISOString(),
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
});

jetstream.onDelete('app.bsky.graph.follow', async (event) => {
  await db.deleteFrom('follows').where('id', '=', event.commit.rkey).execute();
});

const ONE_HOUR = 60 * 60 * 1000;

setInterval(async () => {
  // delete all posts older than 3 hours
  const cutoff = new Date(Date.now() - 3 * ONE_HOUR);
  const results = await db.deleteFrom('post').where('indexedAt', '<', cutoff.toISOString()).execute();
  console.log(`Deleted ${results[0].numDeletedRows} posts`);

  // delete all blocks older than 1 hour
  const blockCutoff = new Date(Date.now() - ONE_HOUR);
  const blockResults = await db.deleteFrom('blocks').where('createdAt', '<', blockCutoff.toISOString()).execute();
  console.log(`Deleted ${blockResults[0].numDeletedRows} blocks`);

  // delete all follows older than 1 hour
  const followCutoff = new Date(Date.now() - ONE_HOUR);
  const followResults = await db.deleteFrom('follows').where('createdAt', '<', followCutoff.toISOString()).execute();
  console.log(`Deleted ${followResults[0].numDeletedRows} follows`);

  // log the db stats
  const postCount = await db
    .selectFrom('post')
    .select(db.fn.countAll().as('count'))
    .executeTakeFirstOrThrow()
    .then((row) => row.count);
  const blockCount = await db
    .selectFrom('blocks')
    .select(db.fn.countAll().as('count'))
    .executeTakeFirstOrThrow()
    .then((row) => row.count);
  const followCount = await db
    .selectFrom('follows')
    .select(db.fn.countAll().as('count'))
    .executeTakeFirstOrThrow()
    .then((row) => row.count);

  console.info(`Post count: ${postCount}, Block count: ${blockCount}, Follow count: ${followCount}`);
}, 60 * 1000);
