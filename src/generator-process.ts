import { db, migrateToLatest } from './db';
import algos from './algos';
import { config } from './config';
import { jetstream } from './firehose';

const main = async () => {
  await migrateToLatest(db);

  // start the feed generators
  for (const [algoName, algo] of Object.entries(algos)) {
    console.log(`Starting generator for algorithm: ${algoName}`);

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
  console.log('Starting firehose...');
  jetstream.start();

  console.log('✅ Generator process started successfully');
};

main().catch((error) => {
  console.error('Error starting generator process', error);
  process.exit(1);
});
