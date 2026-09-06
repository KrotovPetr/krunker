import { afterEach, beforeAll, expect, it } from 'vitest';
import {
  createGame,
  createCollisionWorld,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
  initializePhysics,
  PISTOL,
  TEST_PAD,
  WEAPONS,
} from '../index.js';
import { traceShot } from './weapons.js';
import type { ClientCommand } from '@fps/protocol';
import type { Game } from '../index.js';
beforeAll(initializePhysics);
const resources: { dispose(): void }[] = [];
afterEach(() => resources.splice(0).forEach((r) => r.dispose()));
const step = (game: Game, count = 1) => {
  for (let i = 0; i < count; i++) game.step(1 / 60);
};
const send = (game: Game, command: ClientCommand) =>
  game.enqueue({ type: 'playerCommand', playerId: 'a', command });
function setup() {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0);
  resources.push(game);
  game.enqueue({ type: 'join', playerId: 'a', nickname: 'Solo' });
  send(game, { type: 'ready', ready: true });
  step(game, 20);
  return game;
}
const fire = { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0 } as const;
it('keeps separate magazines, reloads the pistol and preserves the class', () => {
  const game = setup();
  send(game, fire);
  step(game);
  send(game, { type: 'selectSlot', slot: 'secondary' });
  step(game, 15);
  send(game, fire);
  step(game);
  expect(game.snapshot().players[0]).toMatchObject({
    slot: 'secondary',
    weapon: 'rifle',
    maxHealth: 100,
    ammo: 29,
    secondaryAmmo: 11,
  });
  send(game, { type: 'reload' });
  step(game, 20);
  expect(game.snapshot().players[0]!.secondaryAmmo).toBe(11);
  step(game, 60);
  expect(game.snapshot().players[0]!.secondaryAmmo).toBe(PISTOL.magazine);
  send(game, { type: 'selectSlot', slot: 'primary' });
  step(game);
  expect(game.snapshot().players[0]!.ammo).toBe(29);
});
it('switching cannot refill a partial reload or bypass an existing weapon cooldown', () => {
  const game = setup();
  send(game, { type: 'selectWeapon', weapon: 'sniper' });
  step(game);
  send(game, fire);
  step(game);
  send(game, { type: 'reload' });
  step(game, 10);
  send(game, { type: 'selectSlot', slot: 'secondary' });
  step(game);
  expect(game.snapshot().players[0]!.reloadRemaining).toBe(0);
  send(game, fire);
  step(game);
  expect(game.snapshot().players[0]!.secondaryAmmo).toBe(12);
  send(game, { type: 'selectSlot', slot: 'primary' });
  step(game, 150);
  expect(game.snapshot().players[0]!.ammo).toBe(4);
});
it('takes simulation time to aim and refuses client-provided instant accuracy', () => {
  const game = setup();
  send(game, { type: 'selectWeapon', weapon: 'sniper' });
  step(game);
  send(game, {
    type: 'input',
    seq: 1,
    yaw: 0,
    pitch: 0,
    aiming: true,
    buttons: EMPTY_BUTTONS,
  });
  step(game);
  expect(game.snapshot().players[0]!.aimProgress).toBeGreaterThan(0);
  expect(game.snapshot().players[0]!.aimProgress).toBeLessThan(0.1);
  step(game, 13);
  expect(game.snapshot().players[0]!.aimProgress).toBe(1);
  send(game, {
    type: 'input',
    seq: 2,
    yaw: 0,
    pitch: 0,
    aiming: false,
    buttons: EMPTY_BUTTONS,
  });
  step(game, 14);
  expect(game.snapshot().players[0]!.aimProgress).toBe(0);
});
it('sniper hip fire stays on the crosshair as accurately as scoped fire', () => {
  const game = setup(),
    world = createCollisionWorld(TEST_PAD);
  resources.push(world);
  const shooter = game.snapshot().players[0]!;
  shooter.position = { x: 0, y: 0, z: 0 };
  shooter.weapon = 'sniper';
  shooter.grounded = true;
  const target = {
    id: 'target',
    position: { x: 0, y: 0, z: -35 },
    health: 100,
    ready: true,
    crouched: false,
  };
  let hipHits = 0,
    aimedHits = 0;
  for (let seed = 0; seed < 100; seed++) {
    shooter.aimProgress = 0;
    hipHits += Number(
      traceShot(shooter, [target], world, 0, 0, 'sniper', seed * 7919).hits
        .size > 0,
    );
    shooter.aimProgress = 1;
    aimedHits += Number(
      traceShot(shooter, [target], world, 0, 0, 'sniper', seed * 7919).hits
        .size > 0,
    );
  }
  expect(aimedHits).toBe(100);
  expect(hipHits).toBe(100);
  expect(WEAPONS.sniper.aimSeconds).toBeGreaterThan(0);
});
