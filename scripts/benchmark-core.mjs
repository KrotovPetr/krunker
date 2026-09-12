import assert from 'node:assert/strict';
import {
  createGame,
  initializePhysics,
  DEFAULT_CONFIG,
  CITY,
  SANDGATE,
  SPILLWAY,
  ARENA,
} from '../packages/game-core/dist/index.js';

// Run after pnpm build:packages. Fixed seed, five bots, thirty simulated seconds.
await initializePhysics();
const botCount = Number(process.env.BENCH_BOTS ?? 5);
for (const map of [CITY, SANDGATE, SPILLWAY, ARENA].filter(
  (m) => !process.env.BENCH_MAP || m.id === process.env.BENCH_MAP,
)) {
  const game = createGame({ ...DEFAULT_CONFIG, roundSeconds: 600 }, map, 42);
  try {
    game.enqueue({ type: 'join', playerId: 'human', nickname: 'Perf' });
    for (const command of [
      { type: 'setMode', mode: 'bots' },
      { type: 'setBots', count: botCount, difficulty: 'normal' },
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
      startupPeakTick: samples.indexOf(Math.max(...samples.slice(0, 120))),
      stepP50Ms: sorted[Math.floor(sorted.length * 0.5)],
      stepP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      stepMaxMs: Math.max(...sorted),
      players: game.snapshot().players.length,
    };
    console.log(JSON.stringify(result));
    assert.equal(result.players, botCount + 1);
    assert(result.stepP95Ms < 1000 / 60, 'Simulation exceeded its tick budget');
    if (process.env.CHECK_STARTUP_BUDGET === '1')
      assert(
        result.startupMaxMs < 1000 / 60,
        'First bot ticks exceeded the 60 Hz budget',
      );
  } finally {
    game.dispose();
  }
}
