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

// Run after pnpm build:packages. Control: eight participants, two simulated minutes.
await initializePhysics();
const mode = process.env.BENCH_MODE ?? 'bots';
assert(mode === 'bots' || mode === 'control');
const botCount = Number(process.env.BENCH_BOTS ?? (mode === 'control' ? 4 : 5));
const allyCount = mode === 'control' ? 3 : 0;
for (const map of [CITY, SANDGATE, SPILLWAY, ARENA].filter(
  (m) =>
    (mode !== 'control' || m.id === 'bastion') &&
    (!process.env.BENCH_MAP || m.id === process.env.BENCH_MAP),
)) {
  const game = createGame({ ...DEFAULT_CONFIG, roundSeconds: 600 }, map, 42);
  try {
    game.enqueue({ type: 'join', playerId: 'human', nickname: 'Perf' });
    for (const command of [
      { type: 'setMode', mode },
      { type: 'setBots', count: botCount, difficulty: 'normal' },
      ...(mode === 'control' ? [{ type: 'setAllies', count: allyCount }] : []),
      { type: 'ready', ready: true },
    ])
      game.enqueue({ type: 'playerCommand', playerId: 'human', command });
    const samples = [];
    for (let i = 0; i < (mode === 'control' ? 7200 : 1800); i++) {
      const start = performance.now();
      game.step(1 / 60);
      samples.push(performance.now() - start);
    }
    const sorted = samples.slice(120).sort((a, b) => a - b);
    const result = {
      map: map.id,
      mode,
      startupMaxMs: Math.max(...samples.slice(0, 120)),
      startupPeakTick: samples.indexOf(Math.max(...samples.slice(0, 120))),
      stepP50Ms: sorted[Math.floor(sorted.length * 0.5)],
      stepP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      stepMaxMs: Math.max(...sorted),
      players: game.snapshot().players.length,
    };
    console.log(JSON.stringify(result));
    assert.equal(result.players, botCount + allyCount + 1);
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
