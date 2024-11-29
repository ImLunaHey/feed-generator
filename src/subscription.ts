import { OutputSchema as RepoEvent, isCommit } from './lexicon/types/com/atproto/sync/subscribeRepos';
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription';

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return;

    const ops = await getOpsByType(evt);

    const postsToDelete = ops.posts.deletes.map((del) => del.uri);
    const postsToCreate = ops.posts.creates.map((create) => ({
      uri: create.uri,
      cid: create.cid,
      text: create.record.text,
      langs: create.record.langs?.join(',') ?? '',
      indexedAt: new Date().toISOString(),
    }));

    if (postsToDelete.length > 0) {
      await this.db.deleteFrom('post').where('uri', 'in', postsToDelete).execute();
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }
}
