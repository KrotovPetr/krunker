import { afterEach, beforeAll, expect, it } from 'vitest';
import {
  createGame,
  DEFAULT_CONFIG,
  TEST_PAD,
  initializePhysics,
  WEAPONS,
  ARENA,
} from '../index.js';
import type { Game } from '../index.js';
import type { WeaponId } from '@fps/protocol';
beforeAll(initializePhysics);
const games: Game[] = [];
afterEach(() => games.splice(0).forEach((game) => game.dispose()));
it.each<WeaponId>(['rifle', 'sniper', 'shotgun'])(
  'allows solo practice with %s and reloads without starting a match',
  (weapon) => {
    const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0);
    games.push(game);
    game.enqueue({ type: 'join', playerId: 'a', nickname: 'Solo' });
    game.enqueue({
      type: 'playerCommand',
      playerId: 'a',
      command: { type: 'selectWeapon', weapon },
    });
    game.enqueue({
      type: 'playerCommand',
      playerId: 'a',
      command: { type: 'ready', ready: true },
    });
    game.step(1 / 60);
    game.enqueue({
      type: 'playerCommand',
      playerId: 'a',
      command: { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0 },
    });
    expect(game.step(1 / 60).filter((e) => e.type === 'shot')).toHaveLength(1);
    expect(game.snapshot().players[0]!.ammo).toBe(WEAPONS[weapon].magazine - 1);
    game.enqueue({
      type: 'playerCommand',
      playerId: 'a',
      command: { type: 'reload' },
    });
    game.step(1 / 60);
    expect(game.snapshot().players[0]!.reloadRemaining).toBeGreaterThan(0);
    for (let i = 0; i < 180; i++) game.step(1 / 60);
    expect(game.snapshot().players[0]!.ammo).toBe(WEAPONS[weapon].magazine);
    expect(game.snapshot()).toMatchObject({
      phase: 'waiting',
      round: 0,
      remaining: 0,
    });
    expect(game.snapshot().players[0]).toMatchObject({
      health: WEAPONS[weapon].health,
      kills: 0,
      deaths: 0,
    });
  },
);

it('reports target damage in practice without changing health or match score, then removes targets in the match', () => {
  const game = createGame(DEFAULT_CONFIG, ARENA, 0);
  games.push(game);
  game.enqueue({ type: 'join', playerId: 'a', nickname: 'Solo' });
  game.enqueue({
    type: 'playerCommand',
    playerId: 'a',
    command: { type: 'ready', ready: true },
  });
  for (let i = 0; i < 30; i++) game.step(1 / 60);
  game.enqueue({
    type: 'playerCommand',
    playerId: 'a',
    command: { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0 },
  });
  const events = game.step(1 / 60);
  expect(events).toContainEqual({
    type: 'practiceHit',
    playerId: 'a',
    targetId: 'range-near',
    damage: 36,
    headshot: true,
  });
  expect(
    events.some((event) => event.type === 'hit' || event.type === 'kill'),
  ).toBe(false);
  expect(game.snapshot().players[0]).toMatchObject({
    health: 100,
    kills: 0,
    deaths: 0,
  });
  game.enqueue({ type: 'join', playerId: 'b', nickname: 'Second' });
  game.enqueue({
    type: 'playerCommand',
    playerId: 'b',
    command: { type: 'ready', ready: true },
  });
  expect(game.step(1 / 60)).toContainEqual({ type: 'roundStart', round: 1 });
  expect(game.snapshot().phase).toBe('active');
  expect(game.snapshot().players[0]!.ammo).toBe(30);
  expect(game.snapshot().players[0]!.position.x).not.toBe(-25);
  game.enqueue({
    type: 'playerCommand',
    playerId: 'a',
    command: { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0 },
  });
  expect(game.step(1 / 60).some((event) => event.type === 'practiceHit')).toBe(
    false,
  );
});
