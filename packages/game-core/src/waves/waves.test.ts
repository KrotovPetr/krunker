import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createGame,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
  initializePhysics,
  CITY,
  createCollisionWorld,
  WEAPONS,
} from '../index.js';
import type { Game, GameConfig, MapDefinition } from '../index.js';
import type { ClientCommand, GameEvent } from '@fps/protocol';
import { chooseEnemySpawn } from './director.js';

beforeAll(initializePhysics);
const games: Game[] = [];
afterEach(() => games.splice(0).forEach((g) => g.dispose()));
const pad: MapDefinition = {
  id: 'wave-pad',
  blocks: [
    {
      id: 'floor',
      position: { x: 0, y: -0.5, z: 0 },
      size: { x: 44, y: 1, z: 44 },
      shape: 'box',
      yaw: 0,
      color: 0,
    },
  ],
  spawns: Array.from({ length: 8 }, (_, i) => ({
    x: (i - 4) * 2,
    y: 0.03,
    z: 0,
  })),
  defense: {
    players: [
      { x: 0, y: 0.03, z: 0 },
      { x: 0, y: 0.03, z: -3 },
    ],
    enemies: [
      { x: -15, y: 0.03, z: -15 },
      { x: 15, y: 0.03, z: -15 },
    ],
  },
};
const cmd = (g: Game, command: ClientCommand, playerId = 'human') =>
  g.enqueue({ type: 'playerCommand', playerId, command });
const step = (g: Game, count = 1) => {
  const out: GameEvent[] = [];
  for (let i = 0; i < count; i++) out.push(...g.step(1 / 60));
  return out;
};
const human = (g: Game) => g.snapshot().players.find((p) => p.id === 'human')!;
function setup(config: Partial<GameConfig> = {}, map = pad) {
  const g = createGame(
    {
      ...DEFAULT_CONFIG,
      waveBaseEnemies: 2,
      wavePreparationSeconds: 0.15,
      waveSpawnSeconds: 0.1,
      ...config,
    },
    map,
    0,
  );
  games.push(g);
  g.enqueue({ type: 'join', playerId: 'human', nickname: 'Human' });
  cmd(g, { type: 'setMode', mode: 'waves' });
  step(g);
  return g;
}

describe('wave defense', () => {
  it('navigates from city gates to a defender inside the hall', () => {
    const g = setup({}, CITY);
    cmd(g, { type: 'ready', ready: true });
    for (let i = 0; i < 5400 && human(g).health === 100; i++) step(g);
    expect(human(g).health).toBeLessThan(100);
  });
  it('waits for readiness, spawns only at gates, and never spawns inside the defense area', () => {
    const g = setup({}, CITY);
    step(g, 60);
    expect(g.snapshot().players.filter((p) => p.bot)).toHaveLength(0);
    cmd(g, { type: 'ready', ready: true });
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      step(g);
      const state = g.snapshot();
      for (const p of state.players.filter((p) => p.bot && !seen.has(p.id))) {
        seen.add(p.id);
        expect(
          CITY.defense!.enemies.some(
            (gate) =>
              Math.hypot(gate.x - p.position.x, gate.z - p.position.z) < 0.3,
          ),
        ).toBe(true);
        expect(
          Math.hypot(
            p.position.x - human(g).position.x,
            p.position.z - human(g).position.z,
          ),
        ).toBeGreaterThan(10);
      }
    }
    expect(seen.size).toBe(2);
    expect(g.snapshot().wave).toMatchObject({
      status: 'fighting',
      queued: 0,
      alive: 2,
    });
  });
  it('blocks allied damage and late joining players wait for the next wave', () => {
    const g = setup({ protectionSeconds: 0 });
    g.enqueue({ type: 'join', playerId: 'friend', nickname: 'Friend' });
    cmd(g, { type: 'ready', ready: true }, 'friend');
    cmd(g, { type: 'ready', ready: true });
    step(g, 12);
    cmd(g, {
      type: 'input',
      seq: 1,
      yaw: 0,
      pitch: 0,
      aiming: true,
      buttons: EMPTY_BUTTONS,
    });
    cmd(g, { type: 'fire', inputSeq: 1, yaw: 0, pitch: 0 });
    expect(
      step(g).some((e) => e.type === 'hit' && e.targetId === 'friend'),
    ).toBe(false);
    expect(g.snapshot().players.find((p) => p.id === 'friend')!.health).toBe(
      100,
    );
    g.enqueue({ type: 'join', playerId: 'late', nickname: 'Late' });
    cmd(g, { type: 'ready', ready: true }, 'late');
    cmd(g, { type: 'selectWeapon', weapon: 'smg' }, 'late');
    step(g);
    expect(g.snapshot().players.find((p) => p.id === 'late')!.health).toBe(0);
  });
  it('clears a finite wave, restores the team and increases the next wave', () => {
    const g = setup({ protectionSeconds: 60 });
    cmd(g, { type: 'selectWeapon', weapon: 'sniper' });
    cmd(g, { type: 'ready', ready: true });
    step(g, 12);
    let seq = 0;
    const events: GameEvent[] = [];
    for (let i = 0; i < 1500 && g.snapshot().wave.number === 1; i++) {
      const me = human(g),
        enemy = g.snapshot().players.find((p) => p.bot && p.health > 0);
      if (enemy) {
        const dx = enemy.position.x - me.position.x,
          dz = enemy.position.z - me.position.z;
        const yaw = Math.atan2(-dx, -dz),
          pitch = Math.atan2(
            enemy.position.y + 1 - (me.position.y + 1.65),
            Math.hypot(dx, dz),
          );
        cmd(g, {
          type: 'input',
          seq: ++seq,
          yaw,
          pitch,
          aiming: true,
          buttons: EMPTY_BUTTONS,
        });
        if (
          me.aimProgress > 0.99 &&
          me.fireRemaining === 0 &&
          enemy.protectionRemaining === 0
        )
          cmd(g, { type: 'fire', inputSeq: seq, yaw, pitch });
        if (me.ammo === 0) cmd(g, { type: 'reload' });
      }
      events.push(...step(g));
    }
    expect(events.filter((e) => e.type === 'waveCleared')).toHaveLength(1);
    expect(g.snapshot().wave).toMatchObject({
      number: 2,
      cleared: 1,
      status: 'preparing',
      total: 4,
      alive: 0,
    });
    expect(human(g).health).toBe(WEAPONS.sniper.health);
    expect(human(g).ammo).toBe(5);
    expect(human(g).kills).toBe(2);
  });
  it('defeats the squad without endless respawns and restarts only on host request', () => {
    const g = setup({ protectionSeconds: 0 });
    cmd(g, { type: 'ready', ready: true });
    step(g, 3600);
    expect(g.snapshot().wave.status).toBe('defeat');
    expect(g.snapshot().phase).toBe('results');
    const oldLife = human(g).lifeId;
    step(g, 600);
    cmd(g, { type: 'selectWeapon', weapon: 'revolver' });
    step(g);
    expect(human(g).health).toBe(0);
    expect(human(g).lifeId).toBe(oldLife);
    cmd(g, { type: 'restartWaves' });
    step(g);
    expect(g.snapshot().wave).toMatchObject({
      status: 'preparing',
      number: 1,
      cleared: 0,
    });
    expect(human(g).health).toBe(100);
  });
  it('does not choose a gate occupied by a defender', () => {
    const g = setup({}, CITY);
    const p = human(g);
    const world = createCollisionWorld(CITY);
    try {
      const gate = CITY.defense!.enemies[0]!;
      p.position = { ...gate };
      expect(chooseEnemySpawn([gate], [p], [], world)).toBeUndefined();
    } finally {
      world.dispose();
    }
  });
  it('rejects entering defense with more than four humans', () => {
    const g = setup();
    cmd(g, { type: 'setMode', mode: 'arena' });
    step(g);
    for (let i = 0; i < 4; i++)
      g.enqueue({ type: 'join', playerId: `p${i}`, nickname: 'Player' });
    step(g);
    cmd(g, { type: 'setMode', mode: 'waves' });
    expect(step(g)).toContainEqual({
      type: 'commandRejected',
      playerId: 'human',
      reason: 'squadFull',
    });
    expect(g.snapshot().mode).toBe('arena');
  });
});

it('creates optional allied defenders, excludes them from the wave count and disables friendly fire', () => {
  const g = setup({ protectionSeconds: 0, wavePreparationSeconds: 1 });
  cmd(g, { type: 'setAllies', count: 3 });
  cmd(g, { type: 'ready', ready: true });
  step(g);
  const allies = g.snapshot().players.filter((p) => p.ally);
  expect(allies).toHaveLength(3);
  expect(allies.every((p) => p.bot && p.ready)).toBe(true);
  expect(g.snapshot().wave.alive).toBe(0);
  cmd(g, { type: 'selectWeapon', weapon: 'sniper' });
  step(g);
  const a = human(g),
    b = g.snapshot().players.find((p) => p.ally)!;
  const dx = b.position.x - a.position.x,
    dz = b.position.z - a.position.z;
  cmd(g, { type: 'fire', inputSeq: 0, yaw: Math.atan2(-dx, -dz), pitch: 0 });
  expect(
    step(g).some(
      (e) => e.type === 'hit' && allies.some((p) => p.id === e.targetId),
    ),
  ).toBe(false);
  step(g, 90);
  const state = g.snapshot();
  expect(state.wave.alive).toBe(
    state.players.filter((p) => p.bot && !p.ally && p.health > 0).length,
  );
  expect(state.players.filter((p) => p.ally)).toHaveLength(3);
  expect(state.players.length).toBeLessThanOrEqual(8);
});
it('only the host can configure allies and switching modes removes allied bots', () => {
  const g = setup();
  g.enqueue({ type: 'join', playerId: 'guest', nickname: 'Guest' });
  step(g);
  cmd(g, { type: 'setAllies', count: 3 }, 'guest');
  expect(step(g)).toContainEqual({
    type: 'commandRejected',
    playerId: 'guest',
    reason: 'hostOnly',
  });
  expect(g.snapshot().allyCount).toBe(0);
  cmd(g, { type: 'setAllies', count: 2 });
  cmd(g, { type: 'ready', ready: true });
  step(g);
  expect(g.snapshot().players.filter((p) => p.ally)).toHaveLength(2);
  cmd(g, { type: 'setMode', mode: 'arena' });
  step(g);
  expect(g.snapshot().players.some((p) => p.bot)).toBe(false);
});

it('allies independently acquire and shoot enemies without damaging defenders', () => {
  const g = setup(
    { protectionSeconds: 0, wavePreparationSeconds: 0.1, waveBaseEnemies: 5 },
    CITY,
  );
  cmd(g, { type: 'setAllies', count: 2 });
  cmd(g, { type: 'ready', ready: true });
  step(g);
  let alliedShots = 0,
    enemyDamage = 0;
  for (let i = 0; i < 2400 && g.snapshot().wave.status !== 'defeat'; i++) {
    for (const event of step(g)) {
      if (event.type === 'shot' && event.playerId.startsWith('ally:'))
        alliedShots++;
      if (event.type === 'hit' && event.playerId.startsWith('ally:')) {
        expect(event.targetId.startsWith('wave:')).toBe(true);
        enemyDamage += event.damage;
      }
    }
  }
  expect(alliedShots).toBeGreaterThan(0);
  expect(enemyDamage).toBeGreaterThan(0);
});

it('fits four humans, three allies and an enemy without counting allies as attackers', () => {
  const g = setup({ wavePreparationSeconds: 0.1 }, CITY);
  for (const id of ['two', 'three', 'four']) {
    g.enqueue({ type: 'join', playerId: id, nickname: id });
    cmd(g, { type: 'ready', ready: true }, id);
  }
  cmd(g, { type: 'setAllies', count: 3 });
  for (const id of ['human', 'two', 'three', 'four'])
    cmd(g, { type: 'ready', ready: true }, id);
  step(g, 30);
  const state = g.snapshot();
  expect(state.players.filter((p) => p.ally)).toHaveLength(3);
  expect(state.players.filter((p) => p.bot && !p.ally)).toHaveLength(1);
  expect(state.players).toHaveLength(8);
  expect(state.wave.alive).toBe(1);
  expect(state.wave.queued).toBe(1);
});
