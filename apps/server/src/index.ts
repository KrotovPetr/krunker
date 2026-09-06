import { DEFAULT_CONFIG, CITY } from '@fps/game-core';
import { createServer } from './runtime/server.js';

const port = Number(process.env.PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT');
// Short deterministic rounds are available only in a server started explicitly for tests.
const { server } = createServer(
  process.env.NODE_ENV === 'test'
    ? {
        config: {
          ...DEFAULT_CONFIG,
          roundSeconds: 20,
          resultsSeconds: 2,
          respawnSeconds: 0.7,
          protectionSeconds: 0.5,
          trainingSeconds: 6,
          challengeCountdown: 0.5,
          wavePreparationSeconds: 1,
          waveSpawnSeconds: 0.2,
          waveBaseEnemies: 2,
        },
        seed: 0,
      }
    : { map: CITY },
);
await server.listen(port, process.env.HOST ?? '127.0.0.1');
console.info(`FPS server listening on port ${port}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    await server.gracefullyShutdown(false);
  } catch (error) {
    console.error('Server shutdown failed', error);
    process.exitCode = 1;
  }
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
