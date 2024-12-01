import { Jetstream } from '@skyware/jetstream';
import { db } from './db';
import { Tag } from './lexicon/types/app/bsky/richtext/facet';

export const jetstream = new Jetstream({
  wantedCollections: ['app.bsky.feed.post', 'app.bsky.feed.like', 'app.bsky.feed.repost'], // omit to receive all collections
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
      tags: tags.join(',') ?? '',
      indexedAt: new Date().toISOString(),
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

setInterval(async () => {
  // delete all posts older than 1 hour
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const results = await db.deleteFrom('post').where('indexedAt', '<', cutoff.toISOString()).execute();
  console.log(`Deleted ${results[0].numDeletedRows} posts`);

  // log the db stats
  const postCount = await db
    .selectFrom('post')
    .select(db.fn.countAll().as('count'))
    .executeTakeFirstOrThrow()
    .then((row) => row.count);
  console.log(`Post count: ${postCount}`);
}, 60 * 1000);
