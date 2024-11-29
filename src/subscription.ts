import { OutputSchema as RepoEvent, isCommit } from './lexicon/types/com/atproto/sync/subscribeRepos';
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription';

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return;

    const ops = await getOpsByType(evt);

    const postsToDelete = ops.posts.deletes.map((del) => del.uri);
    if (postsToDelete.length > 0) {
      await this.db.deleteFrom('post').where('uri', 'in', postsToDelete).execute();
    }

    const postsToCreate = ops.posts.creates
      .filter((create) => {
        // Only save top posts with text
        return create.record.reply === undefined && create.record.text.trim().length > 0;
      })
      .map((create) => ({
        author: create.author,
        uri: create.uri,
        cid: create.cid,
        text: create.record.text,
        langs: create.record.langs?.join(',') ?? '',
        likes: 0,
        replies: 0,
        indexedAt: new Date().toISOString(),
      }));
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute();
    }

    const postsToLike = ops.likes.creates.map((create) => create.record.subject.uri);
    if (postsToLike.length > 0) {
      await this.db.transaction().execute(async (trx) => {
        for (const post of postsToLike) {
          await trx
            .updateTable('post')
            .set((eb) => ({
              likes: eb('post.likes', '+', 1),
            }))
            .where('uri', '=', post)
            .execute();
        }
      });
    }

    const postsReposted = ops.reposts.creates.map((create) => create.record.subject.uri);
    if (postsReposted.length > 0) {
      await this.db.transaction().execute(async (trx) => {
        for (const post of postsReposted) {
          await trx
            .updateTable('post')
            .set((eb) => ({
              likes: eb('replies', '+', 1),
            }))
            .where('uri', '=', post)
            .execute();
        }
      });
    }
  }
}
