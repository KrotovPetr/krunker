import { afterEach, beforeAll, expect, it } from 'vitest';
import type { ClientCommand, WeaponId } from '@fps/protocol';
import {
  createGame,
  createPrediction,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
  initializePhysics,
  TEST_PAD,
  WEAPONS,
  weaponSpread,
} from '../index.js';
import type { Game } from '../index.js';

beforeAll(initializePhysics);
const resources: { dispose(): void }[] = [];
afterEach(() => resources.splice(0).forEach((resource) => resource.dispose()));
const send = (game: Game, command: ClientCommand) =>
  game.enqueue({ type: 'playerCommand', playerId: 'p', command });
const step = (game: Game, ticks = 1) => {
  for (let i = 0; i < ticks; i++) game.step(1 / 60);
};
const player = (game: Game) =>
  game.snapshot().players.find((p) => p.id === 'p')!;
const fire = { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0 } as const;
function setup(weapon: WeaponId = 'lmg', seed = 0) {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, seed);
  resources.push(game);
  game.enqueue({ type: 'join', playerId: 'p', nickname: 'Gunner' });
  send(game, { type: 'selectWeapon', weapon });
  send(game, { type: 'ready', ready: true });
  step(game, 20);
  return game;
}

it('sustains fast accurate fire, empties a 100-round box, and cannot fire during the six-second reload', () => {
  const game = setup();
  expect(player(game)).toMatchObject({
    weapon: 'lmg',
    ammo: 100,
    reserveAmmo: 300,
  });
  let shots = 0;
  for (let tick = 0; tick < 540; tick++) {
    send(game, fire);
    shots += game.step(1 / 60).filter((event) => event.type === 'shot').length;
    const p = player(game);
    expect(weaponSpread(WEAPONS.lmg, 0, true, 0, p.bloom)).toBeLessThan(0.012);
    expect(weaponSpread(WEAPONS.lmg, 1, true, 0, p.bloom)).toBeLessThan(0.006);
    if (tick === 59) expect(shots).toBe(12);
  }
  expect(shots).toBe(100);
  expect(player(game).ammo).toBe(0);
  send(game, { type: 'reload' });
  step(game);
  for (let tick = 0; tick < 350; tick++) {
    send(game, fire);
    expect(game.step(1 / 60).some((event) => event.type === 'shot')).toBe(
      false,
    );
  }
  expect(player(game)).toMatchObject({ ammo: 0, reserveAmmo: 300 });
  expect(player(game).reloadRemaining).toBeGreaterThan(0);
  step(game, 12);
  expect(player(game)).toMatchObject({
    ammo: 100,
    reserveAmmo: 200,
    reloadRemaining: 0,
  });
  send(game, fire);
  step(game);
  expect(player(game).ammo).toBe(99);
});

it('keeps the heavy class slow on both server and client, including with the pistol equipped', () => {
  const speeds: number[] = [];
  for (const weapon of ['rifle', 'lmg'] as const) {
    const game = setup(weapon);
    const prediction = createPrediction(TEST_PAD);
    resources.push(prediction);
    prediction.reconcile(player(game));
    for (let seq = 1; seq <= 45; seq++) {
      const input = {
        type: 'input',
        seq,
        yaw: 0,
        pitch: 0,
        buttons: { ...EMPTY_BUTTONS, forward: true },
      } as const;
      send(game, input);
      prediction.push(input);
      step(game);
    }
    speeds.push(Math.hypot(player(game).velocity.x, player(game).velocity.z));
    expect(prediction.state()!.position.z).toBeCloseTo(
      player(game).position.z,
      4,
    );
    if (weapon === 'lmg') {
      send(game, { type: 'selectSlot', slot: 'secondary' });
      for (let seq = 46; seq <= 60; seq++) {
        send(game, {
          type: 'input',
          seq,
          yaw: 0,
          pitch: 0,
          buttons: { ...EMPTY_BUTTONS, forward: true },
        });
        step(game);
      }
      expect(player(game).slot).toBe('secondary');
      expect(
        Math.hypot(player(game).velocity.x, player(game).velocity.z),
      ).toBeCloseTo(speeds[1]!);
    }
  }
  expect(speeds[1]! / speeds[0]!).toBeCloseTo(0.6);
});

it('equips machine gunners in bot battles and among optional wave allies', () => {
  const encountered = new Set<WeaponId>();
  for (let seed = 0; seed < 6; seed++) {
    const match = setup('lmg', seed);
    send(match, { type: 'setMode', mode: 'bots' });
    send(match, { type: 'setBots', count: 5, difficulty: 'normal' });
    step(match, 2);
    const weapons = match
      .snapshot()
      .players.filter((p) => p.bot)
      .map((p) => p.weapon);
    expect(new Set(weapons).size).toBe(5);
    weapons.forEach((weapon) => encountered.add(weapon));
  }
  expect([...encountered].sort()).toEqual(Object.keys(WEAPONS).sort());
  const game = setup();
  send(game, { type: 'setMode', mode: 'bots' });
  send(game, { type: 'setBots', count: 5, difficulty: 'normal' });
  step(game, 2);
  expect(
    game.snapshot().players.some((p) => p.bot && !p.ally && p.weapon === 'lmg'),
  ).toBe(true);
  send(game, { type: 'setMode', mode: 'waves' });
  send(game, { type: 'setAllies', count: 3 });
  send(game, { type: 'ready', ready: true });
  step(game, 2);
  expect(
    game.snapshot().players.some((p) => p.ally && p.weapon === 'lmg'),
  ).toBe(true);
});
