import {
  createGame,
  createPrediction,
  initializePhysics,
  DEFAULT_CONFIG,
  TEST_PAD,
} from '../packages/game-core/dist/index.js';

await initializePhysics();
const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0);
const prediction = createPrediction(TEST_PAD);
try {
  for (let i = 0; i < 8; i++)
    game.enqueue({ type: 'join', playerId: String(i), nickname: String(i) });
  game.step(1 / 60);
  prediction.reconcile(game.snapshot().players[0]);
  for (const [name, read] of [
    ['room-snapshot-8-players', () => game.snapshot().players[0]],
    ['prediction-state', () => prediction.state()],
  ]) {
    const batches = [];
    let checksum = 0;
    for (let batch = 0; batch < 60; batch++) {
      const start = performance.now();
      for (let i = 0; i < 200; i++) checksum += read().health;
      if (batch >= 10) batches.push(performance.now() - start);
    }
    batches.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        name,
        callsPerBatch: 200,
        p50Ms: batches[25],
        p95Ms: batches[47],
        checksum,
      }),
    );
  }
} finally {
  prediction.dispose();
  game.dispose();
}
