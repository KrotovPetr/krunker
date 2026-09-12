import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  createGame,
  createPrediction,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
  initializePhysics,
  interpolateSnapshots,
  TEST_PAD,
} from '../index.js';
import type { Game } from '../index.js';
import type { InputCommand } from '@fps/protocol';
beforeAll(initializePhysics);
const resources: { dispose(): void }[] = [];
afterEach(() => resources.splice(0).forEach((r) => r.dispose()));
const step = (game: Game) => game.step(1 / 60);
function setup() {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 1),
    prediction = createPrediction(TEST_PAD);
  resources.push(game, prediction);
  game.enqueue({ type: 'join', playerId: 'a', nickname: 'a' });
  for (let i = 0; i < 10; i++) step(game);
  prediction.reconcile(game.snapshot().players[0]!);
  return { game, prediction };
}
const input = (seq: number): InputCommand => ({
  type: 'input',
  seq,
  yaw: 0,
  pitch: 0,
  buttons: { ...EMPTY_BUTTONS, forward: true, jump: seq === 5 },
});
it('predicts immediately and replays only inputs beyond the server acknowledgement', () => {
  const { game, prediction } = setup();
  for (let seq = 1; seq <= 30; seq++) {
    prediction.push(input(seq));
    game.enqueue({ type: 'playerCommand', playerId: 'a', command: input(seq) });
    step(game);
    if (seq % 6 === 0) prediction.reconcile(game.snapshot().players[0]!);
  }
  expect(prediction.pendingCount).toBe(0);
  expect(prediction.state()?.position).toEqual(
    game.snapshot().players[0]?.position,
  );
  const confirmed = game.snapshot().players[0]!;
  prediction.push(input(31));
  prediction.push(input(32));
  expect(prediction.state()?.position.z).toBeLessThan(confirmed.position.z);
  prediction.reconcile(confirmed);
  expect(prediction.pendingCount).toBe(2);
  for (const seq of [31, 32]) {
    game.enqueue({ type: 'playerCommand', playerId: 'a', command: input(seq) });
    step(game);
  }
  expect(prediction.state()?.position).toEqual(
    game.snapshot().players[0]?.position,
  );
});
it('bounds unacknowledged history and resets it after respawn', () => {
  const { game, prediction } = setup();
  for (let seq = 1; seq < 1000; seq++) prediction.push(input(seq));
  expect(prediction.pendingCount).toBe(120);
  const next = game.snapshot().players[0]!;
  next.lifeId++;
  prediction.reconcile(next);
  expect(prediction.pendingCount).toBe(0);
  expect(prediction.state()?.position).toEqual(next.position);
});
it('returns independent player copies without general-purpose serialization on the render path', () => {
  const { game, prediction } = setup();
  const source = game.snapshot().players[0]!;
  const clone = vi.spyOn(globalThis, 'structuredClone');
  try {
    prediction.reconcile(source);
    const copy = prediction.state()!;
    expect(copy).toEqual(source);
    expect(
      Object.entries(source)
        .filter(([, value]) => value && typeof value === 'object')
        .map(([key]) => key)
        .sort(),
    ).toEqual(['challenge', 'position', 'velocity']);
    copy.position.x += 100;
    copy.velocity.y = 999;
    copy.challenge.hits = 999;
    expect(prediction.state()).toEqual(source);
    const command = input(1);
    prediction.push(command);
    command.buttons.forward = false;
    prediction.reconcile(source);
    expect(prediction.state()!.position.z).toBeLessThan(source.position.z);
    expect(clone).not.toHaveBeenCalled();
  } finally {
    clone.mockRestore();
  }
});
it('interpolates remote positions and wrapped angles without crossing respawns', () => {
  const { game } = setup();
  const older = game.snapshot(),
    newer = structuredClone(older);
  older.tick = 10;
  newer.tick = 16;
  older.players[0]!.yaw = Math.PI - 0.1;
  newer.players[0]!.yaw = -Math.PI + 0.1;
  newer.players[0]!.position.x += 6;
  const middle = interpolateSnapshots(older, newer, 13).players[0]!;
  expect(middle.position.x).toBeCloseTo(older.players[0]!.position.x + 3);
  expect(middle.yaw).toBeCloseTo(Math.PI);
  newer.players[0]!.lifeId++;
  expect(interpolateSnapshots(older, newer, 13).players[0]!.position).toEqual(
    newer.players[0]!.position,
  );
});

it('uses static collision geometry for marker sight and ignores the predicted player collider', () => {
  const wall = {
    id: 'wall',
    shape: 'box' as const,
    yaw: 0,
    color: 0,
    position: { x: 0, y: 1.5, z: -3 },
    size: { x: 4, y: 3, z: 0.5 },
  };
  const high = createPrediction({
    ...TEST_PAD,
    blocks: [...TEST_PAD.blocks, wall],
  });
  const low = createPrediction({
    ...TEST_PAD,
    blocks: [
      ...TEST_PAD.blocks,
      {
        ...wall,
        position: { ...wall.position, y: 0.45 },
        size: { ...wall.size, y: 0.9 },
      },
    ],
  });
  resources.push(high, low);
  const eye = { x: 0, y: 1.65, z: 0 },
    target = { x: 0, y: 1.65, z: -6 };
  expect(high.hasSight(eye, target)).toBe(false);
  expect(low.hasSight(eye, target)).toBe(true);
  expect(low.hasSight(eye, { ...target, y: 0.1 })).toBe(false);
  expect(low.hasSight(eye, eye)).toBe(true);
  const { game } = setup();
  const local = game.snapshot().players[0]!;
  local.position = { x: 0, y: 0.03, z: 0 };
  low.reconcile(local);
  low.push({ ...input(1), buttons: EMPTY_BUTTONS });
  expect(low.hasSight(eye, target)).toBe(true);
});
