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
