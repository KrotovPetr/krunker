import { afterEach, beforeAll, expect, it } from 'vitest';
import {
  createGame,
  DEFAULT_CONFIG,
  initializePhysics,
  createCollisionWorld,
  TEST_PAD,
  WEAPONS,
  weaponSpread,
} from '../index.js';
import { traceShot } from './weapons.js';
import type { Game, MapDefinition } from '../index.js';
import type { ClientCommand } from '@fps/protocol';
beforeAll(initializePhysics);
const games: Game[] = [];
afterEach(() => games.splice(0).forEach((g) => g.dispose()));
const step = (g: Game, n = 1) => {
  for (let i = 0; i < n; i++) g.step(1 / 60);
};
const send = (g: Game, command: ClientCommand) =>
  g.enqueue({ type: 'playerCommand', playerId: 'p', command });
function setup(map: MapDefinition = TEST_PAD) {
  const g = createGame(DEFAULT_CONFIG, map, 0);
  games.push(g);
  g.enqueue({ type: 'join', playerId: 'p', nickname: 'P' });
  send(g, { type: 'ready', ready: true });
  step(g, 20);
  return g;
}
const fire = (g: Game) => {
  send(g, { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0 });
  step(g, 9);
};
it('conserves finite ammunition across full and partial reloads and refuses empty reserve', () => {
  const g = setup();
  for (let magazine = 0; magazine < 4; magazine++) {
    for (let i = 0; i < 30; i++) fire(g);
    expect(g.snapshot().players[0]!.ammo).toBe(0);
    send(g, { type: 'reload' });
    step(g, 100);
    expect(g.snapshot().players[0]!.reserveAmmo).toBe(
      Math.max(0, 60 - magazine * 30),
    );
  }
  const p = g.snapshot().players[0]!;
  expect(p.ammo).toBe(0);
  expect(p.reloadRemaining).toBe(0);
  send(g, { type: 'selectSlot', slot: 'secondary' });
  step(g, 20);
  fire(g);
  send(g, { type: 'reload' });
  step(g, 80);
  expect(g.snapshot().players[0]).toMatchObject({
    secondaryAmmo: 12,
    secondaryReserve: 35,
    ammo: 0,
    reserveAmmo: 0,
  });
});
it('automatic spread grows during sustained fire and recovers between engagements', () => {
  const g = setup();
  fire(g);
  const first = g.snapshot().players[0]!.bloom;
  for (let i = 0; i < 10; i++) fire(g);
  const p = g.snapshot().players[0]!;
  expect(p.bloom).toBeGreaterThan(first * 2);
  expect(weaponSpread(WEAPONS.rifle, 1, true, 0, p.bloom)).toBeGreaterThan(
    WEAPONS.rifle.aimedSpread,
  );
  step(g, 120);
  expect(g.snapshot().players[0]!.bloom).toBe(0);
  expect(weaponSpread(WEAPONS.sniper, 0, false, 18, 0.026)).toBe(0);
});
it('supplies replenish reserve within reach, enforce cooldown, and do not refill a magazine', () => {
  const spawn = TEST_PAD.spawns[0]!;
  const g = setup({ ...TEST_PAD, supplies: [{ ...spawn, y: spawn.y + 0.6 }] });
  fire(g);
  send(g, { type: 'reload' });
  step(g, 100);
  let p = g.snapshot().players[0]!;
  expect(p.reserveAmmo).toBe(90);
  expect(p.supplyCooldown).toBeGreaterThan(18);
  fire(g);
  send(g, { type: 'reload' });
  step(g, 100);
  p = g.snapshot().players[0]!;
  expect(p.reserveAmmo).toBe(89);
  step(g, 1200);
  expect(g.snapshot().players[0]!.reserveAmmo).toBe(90);
});
it('applies distinct head, torso, arm and leg multipliers', () => {
  const g = setup(),
    world = createCollisionWorld(TEST_PAD);
  try {
    const p = g.snapshot().players[0]!;
    p.position = { x: 0, y: 0, z: 0 };
    const target = {
      id: 'target',
      position: { x: 0, y: 0, z: -10 },
      health: 1000,
      ready: true,
      crouched: false,
    };
    for (const [x, y, damage] of [
      [0, 1.65, 200],
      [0, 1.1, 100],
      [0.31, 1.1, 75],
      [0, 0.3, 65],
    ]) {
      const yaw = Math.atan2(-x!, 10),
        pitch = Math.atan2(y! - 1.65, Math.hypot(x!, 10));
      expect(
        traceShot(p, [target], world, yaw, pitch, 'sniper', 1).hits.get(
          'target',
        )?.damage,
      ).toBeCloseTo(damage!);
    }
  } finally {
    world.dispose();
  }
});

it('cannot collect ammunition through a wall even within collection distance', () => {
  const origin = TEST_PAD.spawns[0]!;
  const g = setup({
    ...TEST_PAD,
    supplies: [{ x: origin.x + 1.5, y: origin.y + 0.6, z: origin.z }],
    blocks: [
      ...TEST_PAD.blocks,
      {
        id: 'supply-wall',
        shape: 'box',
        yaw: 0,
        color: 0,
        position: { x: origin.x + 0.8, y: 1.5, z: origin.z },
        size: { x: 0.2, y: 3, z: 3 },
      },
    ],
  });
  fire(g);
  send(g, { type: 'reload' });
  step(g, 110);
  expect(g.snapshot().players[0]!.reserveAmmo).toBe(89);
  expect(g.snapshot().players[0]!.supplyCooldown).toBe(0);
});
