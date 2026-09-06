import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createGame,
  DEFAULT_CONFIG,
  TEST_PAD,
  initializePhysics,
  EMPTY_BUTTONS,
} from './index.js';
import type { Game } from './index.js';

const step = (game: Game) => game.step(1 / DEFAULT_CONFIG.tickRate);
const games: Game[] = [];
beforeAll(initializePhysics);
afterEach(() => {
  for (const game of games) game.dispose();
  games.length = 0;
});
const create = () => {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 42);
  games.push(game);
  return game;
};

describe('game membership', () => {
  it('applies commands only on a fixed step', () => {
    const game = create();
    game.enqueue({ type: 'join', playerId: 'a', nickname: 'Alice' });
    expect(game.snapshot().players).toHaveLength(0);
    expect(step(game)).toEqual([{ type: 'playerJoined', playerId: 'a' }]);
    expect(game.snapshot().players[0]?.nickname).toBe('Alice');
  });
  it('replays identical commands deterministically', () => {
    const first = create();
    const second = create();
    for (const game of [first, second]) {
      for (const id of ['a', 'b', 'c'])
        game.enqueue({ type: 'join', playerId: id, nickname: id });
      step(game);
    }
    expect(first.snapshot()).toEqual(second.snapshot());
    expect(
      new Set(first.snapshot().players.map((p) => JSON.stringify(p.position)))
        .size,
    ).toBe(3);
  });
  it('caps membership at eight and ignores duplicate joins', () => {
    const game = create();
    for (let i = 0; i < 10; i++)
      game.enqueue({ type: 'join', playerId: String(i), nickname: String(i) });
    game.enqueue({ type: 'join', playerId: '0', nickname: 'Changed' });
    expect(step(game)).toHaveLength(8);
    expect(game.snapshot().players).toHaveLength(8);
    expect(game.snapshot().players[0]?.nickname).toBe('0');
  });
  it('reuses a free spawn without overlapping remaining players', () => {
    const game = create();
    for (const id of ['a', 'b'])
      game.enqueue({ type: 'join', playerId: id, nickname: id });
    step(game);
    game.enqueue({ type: 'leave', playerId: 'a' });
    game.enqueue({ type: 'join', playerId: 'c', nickname: 'Carol' });
    step(game);
    const players = game.snapshot().players;
    expect(players[0]?.position).not.toEqual(players[1]?.position);
  });
  it('does not expose mutable internal state', () => {
    const game = create();
    game.enqueue({ type: 'join', playerId: 'a', nickname: 'Alice' });
    step(game);
    const player = game.snapshot().players[0];
    if (!player) throw new Error('Player missing');
    player.position.x = 999;
    expect(game.snapshot().players[0]?.position.x).not.toBe(999);
  });
  it('updates only the addressed player', () => {
    const game = create();
    for (const id of ['a', 'b'])
      game.enqueue({ type: 'join', playerId: id, nickname: id });
    game.enqueue({
      type: 'playerCommand',
      playerId: 'a',
      command: { type: 'ready', ready: true },
    });
    step(game);
    expect(game.snapshot().players.map((p) => p.ready)).toEqual([true, false]);
  });
  it('rejects variable or invalid timesteps', () => {
    const game = create();
    for (const delta of [0, -1, NaN, Infinity, 1 / 144])
      expect(() => game.step(delta)).toThrow();
  });
});

describe('authoritative input', () => {
  function joined() {
    const game = create();
    game.enqueue({ type: 'join', playerId: 'a', nickname: 'Alice' });
    for (let i = 0; i < 10; i++) step(game);
    return game;
  }
  const command = (seq: number, forward = true) => ({
    type: 'playerCommand' as const,
    playerId: 'a',
    command: {
      type: 'input' as const,
      seq,
      yaw: 0,
      pitch: 0,
      buttons: { ...EMPTY_BUTTONS, forward },
    },
  });
  it('moves once per server tick even when many inputs arrive together', () => {
    const normal = joined(),
      flooded = joined();
    normal.enqueue(command(100));
    for (let seq = 1; seq <= 100; seq++) flooded.enqueue(command(seq));
    step(normal);
    step(flooded);
    expect(flooded.snapshot().players[0]?.position).toEqual(
      normal.snapshot().players[0]?.position,
    );
    expect(flooded.snapshot().players[0]?.lastProcessedInput).toBeLessThan(100);
  });
  it('ignores old and duplicate sequence numbers', () => {
    const game = joined();
    game.enqueue(command(5));
    step(game);
    game.enqueue(command(4, false));
    game.enqueue(command(5, false));
    step(game);
    expect(game.snapshot().players[0]?.lastProcessedInput).toBe(5);
    expect(game.snapshot().players[0]?.velocity.z).toBeLessThan(-1);
  });
  it('releases stale input when a client stops sending commands', () => {
    const game = joined();
    const start = game.snapshot().players[0]!.position;
    game.enqueue(command(1));
    for (let i = 0; i < 120; i++) step(game);
    const end = game.snapshot().players[0]!;
    expect(Math.abs(end.velocity.z)).toBeLessThan(0.001);
    expect(start.z - end.position.z).toBeLessThan(4);
  });
  it('preserves a short jump pressed and released between simulation ticks', () => {
    const game = joined();
    const press = command(1, false);
    press.command.buttons.jump = true;
    game.enqueue(press);
    game.enqueue(command(2, false));
    step(game);
    expect(game.snapshot().players[0]!.velocity.y).toBeGreaterThan(0);
  });
  it('releases physics resources and rejects further stepping after disposal', () => {
    const game = joined();
    game.dispose();
    expect(() => game.dispose()).not.toThrow();
    expect(() => step(game)).toThrow('disposed');
  });
});
