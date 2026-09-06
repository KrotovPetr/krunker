import assert from 'node:assert/strict';
import {
  createGame,
  initializePhysics,
  DEFAULT_CONFIG,
  CITY,
  SANDGATE,
} from '../packages/game-core/dist/index.js';

// Run after pnpm build:packages. Fixed seed, five bots, thirty simulated seconds.
await initializePhysics();
for (const map of [CITY, SANDGATE]) {
  const game = createGame({ ...DEFAULT_CONFIG, roundSeconds: 600 }, map, 42);
  try {
    game.enqueue({ type: 'join', playerId: 'human', nickname: 'Perf' });
    for (const command of [
      { type: 'setMode', mode: 'bots' },
      { type: 'setBots', count: 5, difficulty: 'normal' },
      { type: 'ready', ready: true },
    ])
      game.enqueue({ type: 'playerCommand', playerId: 'human', command });
    const samples = [];
    for (let i = 0; i < 1800; i++) {
      const start = performance.now();
      game.step(1 / 60);
      samples.push(performance.now() - start);
    }
    const sorted = samples.slice(120).sort((a, b) => a - b);
    const result = {
      map: map.id,
      startupMaxMs: Math.max(...samples.slice(0, 120)),
      stepP50Ms: sorted[Math.floor(sorted.length * 0.5)],
      stepP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      stepMaxMs: Math.max(...sorted),
      players: game.snapshot().players.length,
    };
    console.log(JSON.stringify(result));
    assert.equal(result.players, 6);
    assert(result.stepP95Ms < 1000 / 60, 'Simulation exceeded its tick budget');
  } finally {
    game.dispose();
  }
}
