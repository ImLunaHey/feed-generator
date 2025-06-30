import { serve } from '@hono/node-server';
import { db, migrateToLatest } from './db';
import server from './server';
import algos from './algos';
import { config } from './config';
import { jetstream } from './firehose';

const main = async () => {
  await migrateToLatest(db);

  // Start the web server
  serve(server, (info) => {
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
