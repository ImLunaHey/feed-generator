import { Jetstream } from '@skyware/jetstream';
import { db } from './db.js';

export const jetstream = new Jetstream({
  wantedCollections: ['app.bsky.feed.post', 'app.bsky.feed.like', 'app.bsky.feed.repost'], // omit to receive all collections
  wantedDids: [],
});

jetstream.onCreate('app.bsky.feed.post', async (event) => {
  await db
    .insertInto('post')
    .values({
      author: event.did,
      uri: `at://${event.did}/app.bsky.feed.post/${event.commit.cid}`,
      cid: event.commit.cid,
      text: event.commit.record.text,
      langs: event.commit.record.langs?.join(',') ?? '',
      likes: 0,
      replies: 0,
      labels: event.commit.record.labels?.values?.map((label) => label.val).join(',') ?? '',
      hasImage: event.commit.record.embed?.$type === 'app.bsky.embed.images' ? 1 : 0,
      hasAlt:
        event.commit.record.embed &&
        ('images' in event.commit.record.embed ? event.commit.record.embed.images : [])?.some(
          (img) => img.alt && img.alt?.trim().length > 0,
        )
          ? 1
          : 0,
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
