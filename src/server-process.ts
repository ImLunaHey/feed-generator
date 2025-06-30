import { serve } from '@hono/node-server';
import { db, migrateToLatest } from './db';
import server from './server';
import { config } from './config';

const main = async () => {
  await migrateToLatest(db);

  // Start the web server only
  serve(server, (info) => {
    console.log(`🤖 running feed generator server at http://${info.address}:${info.port}`);
  });
};

main().catch((error) => {
  console.error('Error starting feed generator server', error);
  process.exit(1);
});
