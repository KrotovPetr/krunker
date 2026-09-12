import { afterEach, beforeAll, expect, it } from 'vitest';
import {
  createGame,
  createCollisionWorld,
  DEFAULT_CONFIG,
  initializePhysics,
  TEST_PAD,
  EMPTY_BUTTONS,
  getMap,
  type Game,
} from '../index.js';
import { CONTROL, emptyControl, stepControl } from './control.js';
import { visible } from '../bots/navigation.js';
import {
  clientCommandSchema,
  type ClientCommand,
  type PlayerSnapshot,
} from '@fps/protocol';

beforeAll(initializePhysics);
const resources: { dispose(): void }[] = [];
afterEach(() => resources.splice(0).forEach((r) => r.dispose()));
const step = (game: Game, ticks = 1) => {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.step(1 / 60));
  return events;
};
const send = (game: Game, command: ClientCommand, id = 'p') =>
  game.enqueue({ type: 'playerCommand', playerId: id, command });
function setup(control = false) {
  const game = createGame(
    { ...DEFAULT_CONFIG, protectionSeconds: 0 },
    TEST_PAD,
    0,
  );
  resources.push(game);
  game.enqueue({ type: 'join', playerId: 'p', nickname: 'Commander' });
  if (control) send(game, { type: 'setMode', mode: 'control' });
  step(game);
  return game;
}
const point = {
  position: { x: 0, y: 0.03, z: 0 },
  radius: 4,
  allies: [],
  enemies: [],
};
function fixture() {
  const game = setup();
  const world = createCollisionWorld(TEST_PAD);
  resources.push(world);
  const player = {
    ...game.snapshot().players[0]!,
    ready: true,
    protectionRemaining: 0,
    position: { ...point.position },
  };
  const enemy: PlayerSnapshot = {
    ...player,
    id: 'enemy',
    bot: true,
    ally: false,
  };
  return { player, enemy, world };
}

it('captures in five seconds without stacking speed, scores possession and freezes while contested', () => {
  const { player, enemy, world } = fixture(),
    state = emptyControl();
  stepControl(state, 4, [player, { ...player, id: 'mate' }], point, world);
  expect(state.progress).toBeCloseTo(0.8);
  expect(state.allyScore).toBe(0);
  stepControl(state, 1, [player], point, world);
  expect(state.owner).toBe('allies');
  expect(state.allyScore).toBeCloseTo(0);
  stepControl(state, 2, [], point, world);
  expect(state.allyScore).toBeCloseTo(2);
  stepControl(state, 5, [player, enemy], point, world);
  expect(state.contested).toBe(true);
  expect(state.allyScore).toBeCloseTo(2);
  expect(state.progress).toBe(1);
  stepControl(state, 5, [enemy], point, world);
  expect(state.owner).toBe('neutral');
  expect(state.progress).toBe(0);
  stepControl(state, 5, [enemy], point, world);
  expect(state.owner).toBe('enemies');
  expect(state.enemyScore).toBe(0);
  stepControl(state, 100, [], point, world);
  expect(state.enemyScore).toBe(CONTROL.scoreToWin);
});

it('excludes rooftops, walls, spawn shields, dead and disconnected players', () => {
  const { player, world } = fixture();
  for (const update of [
    { position: { x: 0, y: 4.03, z: 0 } },
    { position: { x: 5, y: 0.03, z: 0 } },
    { health: 0 },
    { connected: false },
    { ready: false },
    { protectionRemaining: 1 },
  ]) {
    const state = emptyControl();
    stepControl(state, 6, [{ ...player, ...update }], point, world);
    expect(state.progress).toBe(0);
  }
  const state = emptyControl();
  stepControl(
    state,
    6,
    [{ ...player, position: { x: 2, y: 0.03, z: 0 } }],
    point,
    { ...world, raycast: () => 0 },
  );
  expect(state.allies).toBe(0);
});

it('gives the same capture and scoring result at different tick rates', () => {
  const { player, world } = fixture();
  for (const rate of [30, 60, 120]) {
    const state = emptyControl();
    for (let i = 0; i < 7 * rate; i++)
      stepControl(state, 1 / rate, [player], point, world);
    expect(state.owner).toBe('allies');
    expect(state.allyScore).toBeCloseTo(2);
  }
});

it('places both teams behind existing cover without obstructing their spawns', () => {
  const map = getMap('bastion'),
    objective = map.control!;
  const world = createCollisionWorld(map);
  resources.push(world);
  for (const spawn of [...objective.allies, ...objective.enemies]) {
    expect(world.canOccupy(spawn, 1.8)).toBe(true);
    expect(
      visible(
        world,
        { ...objective.position, y: objective.position.y + 1.65 },
        { ...spawn, y: spawn.y + 1.65 },
      ),
    ).toBe(false);
  }
});

it('starts on Bastion with two allies, sends bots toward the point and completes scored rounds', () => {
  const game = setup(true);
  expect(game.snapshot()).toMatchObject({
    mode: 'control',
    mapId: 'bastion',
    phase: 'waiting',
    allyCount: 2,
  });
  expect(game.snapshot().players.filter((p) => p.ally)).toHaveLength(2);
  send(game, { type: 'ready', ready: true });
  step(game);
  expect(game.snapshot().phase).toBe('active');
  const bots = game.snapshot().players.filter((p) => p.bot);
  const objective = getMap('bastion').control!;
  const initialDistance = bots.reduce(
    (sum, p) => sum + Math.hypot(p.position.x, p.position.z + 5),
    0,
  );
  step(game, 900);
  const later = game.snapshot().players.filter((p) => p.bot);
  expect(
    later.reduce(
      (sum, p) => sum + Math.hypot(p.position.x, p.position.z + 5),
      0,
    ),
  ).toBeLessThan(initialDistance);
  expect(
    later.some(
      (p) => Math.hypot(p.position.x, p.position.z + 5) <= objective.radius,
    ),
  ).toBe(true);
  const events = step(game, 11000);
  expect(events.some((e) => e.type === 'roundEnd')).toBe(true);
  expect(game.snapshot().players.length).toBeLessThanOrEqual(8);
});

it('validates, rate-limits, synchronizes and clears squad orders', () => {
  const game = setup(true);
  const order = {
    type: 'squadOrder',
    kind: 'follow',
    yaw: 0,
    pitch: 0,
  } as const;
  send(game, order);
  expect(step(game).some((e) => e.type === 'commandRejected')).toBe(true);
  send(game, { type: 'ready', ready: true });
  step(game);
  send(game, order);
  step(game);
  expect(game.snapshot().squadOrder).toMatchObject({
    kind: 'follow',
    commanderId: 'p',
  });
  send(game, { ...order, kind: 'attack' });
  expect(step(game)).toContainEqual({
    type: 'commandRejected',
    playerId: 'p',
    reason: 'orderCooldown',
  });
  step(game, 61);
  send(game, { ...order, kind: 'hold', pitch: -Math.PI / 2 });
  step(game);
  expect(game.snapshot().squadOrder?.kind).toBe('hold');
  step(game, 61);
  send(game, { ...order, kind: 'hold', pitch: Math.PI / 2 });
  expect(step(game)).toContainEqual({
    type: 'commandRejected',
    playerId: 'p',
    reason: 'invalidOrder',
  });
  step(game, 61);
  send(game, { ...order, kind: 'attack' });
  step(game);
  expect(game.snapshot().squadOrder?.position).toEqual(
    getMap('bastion').control!.position,
  );
  game.enqueue({ type: 'connection', playerId: 'p', connected: false });
  step(game);
  expect(game.snapshot().squadOrder?.kind).toBe('auto');
  expect(game.snapshot().phase).toBe('waiting');
  game.enqueue({ type: 'connection', playerId: 'p', connected: true });
  step(game);
  send(game, { type: 'setMode', mode: 'arena' });
  step(game);
  expect(game.snapshot().control).toEqual(emptyControl());
  expect(game.snapshot().squadOrder?.kind).toBe('auto');
  expect(game.snapshot().players.filter((p) => p.bot)).toEqual([]);
  expect(
    clientCommandSchema.safeParse({ ...order, position: point.position })
      .success,
  ).toBe(false);
  expect(clientCommandSchema.safeParse({ ...order, yaw: NaN }).success).toBe(
    false,
  );
});

it('expires orders after thirty seconds and supports follow orders in waves', () => {
  const game = createGame(
    { ...DEFAULT_CONFIG, wavePreparationSeconds: 120 },
    TEST_PAD,
    0,
  );
  resources.push(game);
  game.enqueue({ type: 'join', playerId: 'p', nickname: 'Commander' });
  send(game, { type: 'setMode', mode: 'waves' });
  send(game, { type: 'setAllies', count: 2 });
  send(game, { type: 'ready', ready: true });
  step(game);
  send(game, { type: 'squadOrder', kind: 'follow', yaw: 0, pitch: 0 });
  step(game);
  expect(game.snapshot().squadOrder?.kind).toBe('follow');
  step(game, 1801);
  expect(game.snapshot().squadOrder?.kind).toBe('auto');
});

it('does not damage allies with a direct shot in control mode', () => {
  const game = setup(true);
  send(game, { type: 'selectWeapon', weapon: 'sniper' });
  send(game, { type: 'ready', ready: true });
  step(game, 20);
  const player = game.snapshot().players.find((p) => !p.bot)!;
  const ally = game.snapshot().players.find((p) => p.ally)!;
  const dx = ally.position.x - player.position.x,
    dz = ally.position.z - player.position.z;
  const yaw = Math.atan2(-dx, -dz),
    pitch = Math.atan2(
      ally.position.y - player.position.y - 0.5,
      Math.hypot(dx, dz),
    );
  send(game, { type: 'input', seq: 1, yaw, pitch, buttons: EMPTY_BUTTONS });
  send(game, { type: 'fire', inputSeq: 1, yaw, pitch });
  const events = step(game);
  expect(events.some((e) => e.type === 'shot')).toBe(true);
  expect(events.some((e) => e.type === 'hit' && e.targetId === ally.id)).toBe(
    false,
  );
  expect(game.snapshot().players.find((p) => p.id === ally.id)?.health).toBe(
    100,
  );
});
