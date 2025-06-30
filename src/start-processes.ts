import { spawn } from 'child_process';

const startProcess = (script: string, name: string) => {
  console.log(`Starting ${name}...`);

  const child = spawn('npx', ['tsx', script], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '--experimental-websocket',
    },
  });

  child.on('error', (error) => {
    console.error(`Error starting ${name}:`, error);
  });

  child.on('exit', (code) => {
    console.log(`${name} process exited with code ${code}`);
  });

  return child;
};

const main = async () => {
  console.log('Starting feed generator processes...');

  // Start server process
  const serverProcess = startProcess('./src/server-process.ts', 'Server');

  // Start generator process
  const generatorProcess = startProcess('./src/generator-process.ts', 'Generator');

  // Handle cleanup on exit
  const cleanup = () => {
    console.log('Shutting down processes...');
    serverProcess.kill();
    generatorProcess.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Wait for both processes
  await Promise.all([
    new Promise((resolve) => serverProcess.on('exit', resolve)),
    new Promise((resolve) => generatorProcess.on('exit', resolve)),
  ]);
};

main().catch((error) => {
  console.error('Error starting processes:', error);
  process.exit(1);
});
