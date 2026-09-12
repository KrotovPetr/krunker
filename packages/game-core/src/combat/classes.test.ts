import { afterEach, beforeAll, expect, it } from 'vitest';
import {
  clientCommandSchema,
  weaponSchema,
  type ClientCommand,
} from '@fps/protocol';
import {
  createGame,
  createCollisionWorld,
  DEFAULT_CONFIG,
  initializePhysics,
  TEST_PAD,
  WEAPONS,
  weaponSpread,
  PLAYER_CLASSES,
  PLAYABLE_WEAPONS,
  roleForWeapon,
  type Game,
} from '../index.js';
import { traceShot } from './weapons.js';

beforeAll(initializePhysics);
const games: Game[] = [];
afterEach(() => games.splice(0).forEach((game) => game.dispose()));
function setup() {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0);
  games.push(game);
  game.enqueue({ type: 'join', playerId: 'p', nickname: 'Player' });
  game.step(1 / 60);
  return game;
}
const send = (game: Game, command: ClientCommand) => {
  game.enqueue({ type: 'playerCommand', playerId: 'p', command });
  game.step(1 / 60);
};

it('exposes five roles, six mutually exclusive primaries and no retired revolver', () => {
  expect(PLAYER_CLASSES).toHaveLength(5);
  expect(new Set(PLAYABLE_WEAPONS).size).toBe(6);
  expect(roleForWeapon('shotgun')).toBe(roleForWeapon('rifle'));
  expect(roleForWeapon('sapper')?.id).toBe('engineer');
  expect(roleForWeapon('revolver')).toBeUndefined();
  expect(weaponSchema.safeParse('revolver').success).toBe(true);
  expect(
    clientCommandSchema.safeParse({ type: 'selectWeapon', weapon: 'revolver' })
      .success,
  ).toBe(false);
  const game = setup();
  for (const weapon of PLAYABLE_WEAPONS) {
    send(game, { type: 'selectWeapon', weapon });
    expect(game.snapshot().players[0]).toMatchObject({
      weapon,
      health: 100,
      maxHealth: 100,
      ammo: WEAPONS[weapon].magazine,
      secondaryAmmo: 12,
      slot: 'primary',
    });
  }
  const before = game.snapshot().players[0];
  send(game, {
    type: 'selectWeapon',
    weapon: 'revolver',
  } as unknown as ClientCommand);
  expect(game.snapshot().players[0]?.weapon).toBe(before?.weapon);
  expect(WEAPONS.shotgun.speed).toBe(WEAPONS.rifle.speed);
});

it('prevents primary swaps during a live match but allows a new assault loadout before the match', () => {
  const game = setup();
  send(game, { type: 'selectWeapon', weapon: 'shotgun' });
  game.enqueue({ type: 'join', playerId: 'other', nickname: 'Other' });
  game.enqueue({
    type: 'playerCommand',
    playerId: 'other',
    command: { type: 'ready', ready: true },
  });
  send(game, { type: 'ready', ready: true });
  expect(game.snapshot().phase).toBe('active');
  send(game, { type: 'selectWeapon', weapon: 'rifle' });
  expect(game.snapshot().players[0]?.weapon).toBe('shotgun');
});

it('makes the machine gun substantially less accurate while moving even through sights', () => {
  const gun = WEAPONS.lmg;
  const stationary = weaponSpread(gun, 1, true, 0);
  expect(stationary).toBeCloseTo(0.002);
  expect(weaponSpread(gun, 1, true, 6.97)).toBeGreaterThan(stationary * 10);
  expect(weaponSpread(gun, 0, true, 0)).toBeGreaterThan(stationary * 10);
  expect(weaponSpread(gun, 1, true, 0, gun.maxBloom)).toBeGreaterThan(
    stationary,
  );
  expect(WEAPONS.lmg.speed).toBe(0.82);
});

it('limits scout damage by distance while preserving the rifle mid-range role', () => {
  const game = setup();
  const world = createCollisionWorld(TEST_PAD);
  try {
    const shooter = game.snapshot().players[0]!;
    Object.assign(shooter, {
      position: { x: 0, y: 0.03, z: 0 },
      aimProgress: 1,
      grounded: true,
    });
    const damage = (distance: number, weapon: 'smg' | 'rifle') => {
      const target = {
        id: 'target',
        position: { x: 0, y: 0.03, z: -distance },
        health: 100,
        ready: true,
        crouched: false,
      };
      return (
        traceShot(
          shooter,
          [target],
          world,
          0,
          Math.atan2(-0.55, distance),
          weapon,
          1,
        ).hits.get('target')?.damage ?? 0
      );
    };
    expect(damage(5, 'smg')).toBeCloseTo(18);
    expect(damage(20, 'smg')).toBeLessThan(12);
    expect(damage(20, 'rifle')).toBeCloseTo(24);
    expect(damage(41, 'smg')).toBe(0);
  } finally {
    world.dispose();
  }
});
