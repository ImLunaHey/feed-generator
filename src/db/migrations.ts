import { Kysely, Migration, MigrationProvider } from 'kysely';

const migrations: Record<string, Migration> = {};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('author', 'varchar', (col) => col.notNull())
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .addColumn('text', 'varchar', (col) => col.notNull())
      .addColumn('langs', 'varchar', (col) => col.notNull())
      .addColumn('likes', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('replies', 'integer', (col) => col.notNull().defaultTo(0))
      .execute();
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute();
    await db.schema.dropTable('sub_state').execute();
  },
};

migrations['002'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('labels', 'varchar', (col) => col.notNull().defaultTo(''))
      .execute();

    await db.schema
      .alterTable('post')
      .addColumn('hasImage', 'boolean', (col) => col.notNull().defaultTo(false))
      .execute();

    await db.schema
      .alterTable('post')
      .addColumn('hasAlt', 'boolean', (col) => col.notNull().defaultTo(false))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('labels').execute();
  },
};

migrations['003'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('hasImage').execute();

    await db.schema
      .alterTable('post')
      .addColumn('hasImage', 'integer', (col) => col.notNull().defaultTo(0))
      .execute();

    await db.schema.alterTable('post').dropColumn('hasAlt').execute();

    await db.schema
      .alterTable('post')
      .addColumn('hasAlt', 'integer', (col) => col.notNull().defaultTo(0))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('labels').execute();
  },
};

migrations['004'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('embedUrl', 'varchar', (col) => col.notNull().defaultTo(''))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('embedUrl').execute();
  },
};

migrations['005'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('feed_stats')
      .addColumn('feed', 'varchar', (col) => col.primaryKey())
      .addColumn('user', 'varchar', (col) => col.notNull().defaultTo(0))
      .addColumn('fetches', 'integer', (col) => col.notNull().defaultTo(0))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('feed_stats').execute();
  },
};

migrations['006'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('tags', 'varchar', (col) => col.notNull().defaultTo(''))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('tags').execute();
  },
};

migrations['007'] = {
  async up(db: Kysely<unknown>) {
    // the primary key for the feed stats should be a composite key
    await db.schema.dropTable('feed_stats').execute();

    await db.schema
      .createTable('feed_stats')
      .addColumn('feed', 'varchar', (col) => col.notNull())
      .addColumn('user', 'varchar', (col) => col.notNull())
      .addColumn('fetches', 'integer', (col) => col.notNull())
      .addPrimaryKeyConstraint('primary_key', ['feed', 'user'])
      .execute();
  },
  async down(db: Kysely<unknown>) {},
};

migrations['008'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('hasAlt').execute();

    await db.schema
      .alterTable('post')
      .addColumn('altText', 'varchar', (col) => col.notNull().defaultTo(''))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('hasAlt', 'integer', (col) => col.notNull().defaultTo(0))
      .execute();

    await db.schema.alterTable('post').dropColumn('altText').execute();
  },
};

migrations['009'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('links', 'varchar', (col) => col.notNull().defaultTo(''))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('links').execute();
  },
};

migrations['010'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('rootPostUri', 'varchar', (col) => col.notNull().defaultTo(''))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('rootPostUri').execute();
  },
};

migrations['011'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('blocks')
      .addColumn('id', 'varchar', (col) => col.primaryKey())
      .addColumn('blocker', 'varchar', (col) => col.notNull())
      .addColumn('blocked', 'varchar', (col) => col.notNull())
      .addColumn('createdAt', 'varchar', (col) => col.notNull())
      .execute();

    await db.schema
      .createTable('follows')
      .addColumn('id', 'varchar', (col) => col.primaryKey())
      .addColumn('follower', 'varchar', (col) => col.notNull())
      .addColumn('followed', 'varchar', (col) => col.notNull())
      .addColumn('createdAt', 'varchar', (col) => col.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('blocks').execute();
    await db.schema.dropTable('follows').execute();
  },
};

migrations['012'] = {
  async up(db: Kysely<unknown>) {
    // Add indexes for frequently queried columns
    await db.schema.createIndex('post_author_idx').on('post').column('author').execute();

    await db.schema.createIndex('post_indexed_at_idx').on('post').column('indexedAt').execute();

    await db.schema.createIndex('post_likes_idx').on('post').column('likes').execute();

    await db.schema.createIndex('post_replies_idx').on('post').column('replies').execute();

    await db.schema.createIndex('post_tags_idx').on('post').column('tags').execute();

    await db.schema.createIndex('blocks_created_at_idx').on('blocks').column('createdAt').execute();

    await db.schema.createIndex('follows_created_at_idx').on('follows').column('createdAt').execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex('post_author_idx').execute();
    await db.schema.dropIndex('post_indexed_at_idx').execute();
    await db.schema.dropIndex('post_likes_idx').execute();
    await db.schema.dropIndex('post_replies_idx').execute();
    await db.schema.dropIndex('post_tags_idx').execute();
    await db.schema.dropIndex('blocks_created_at_idx').execute();
    await db.schema.dropIndex('follows_created_at_idx').execute();
  },
};
