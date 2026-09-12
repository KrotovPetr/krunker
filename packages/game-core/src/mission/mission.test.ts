import { beforeAll, afterEach, expect, it } from 'vitest';
import type { PlayerSnapshot, ClientCommand } from '@fps/protocol';
import { clientCommandSchema } from '@fps/protocol';
import {
  createGame,
  createCollisionWorld,
  DEFAULT_CONFIG,
  initializePhysics,
  getMap,
  TEST_PAD,
  type Game,
} from '../index.js';
import { createNavigation } from '../bots/navigation.js';
import { createBotBrain } from '../bots/brain.js';
import {
  emptyMission,
  enterMissionStage,
  stepMission,
  MISSION,
  missionPoint,
} from './mission.js';

beforeAll(initializePhysics);
const resources: { dispose(): void }[] = [];
afterEach(() => resources.splice(0).forEach((r) => r.dispose()));
const tick = (game: Game, count = 1) => {
  for (let i = 0; i < count; i++) game.step(1 / 60);
};
const send = (game: Game, command: ClientCommand, playerId = 'p') =>
  game.enqueue({ type: 'playerCommand', playerId, command });
function fixture() {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0);
  resources.push(game);
  game.enqueue({ type: 'join', playerId: 'p', nickname: 'Player' });
  tick(game);
  const player = {
    ...game.snapshot().players[0]!,
    ready: true,
    protectionRemaining: 0,
  };
  const world = createCollisionWorld(getMap('bastion'));
  resources.push(world);
  return { game, player, world };
}

it('all mission objectives are occupiable and connected by the real Bastion navigation graph', () => {
  const { world } = fixture();
  const map = getMap('bastion');
  const nav = createNavigation(map, world);
  let previous = map.control!.allies[0]!;
  for (const stage of [
    'dispatch',
    'cell',
    'deliver',
    'switch',
    'defend',
    'override',
    'extract',
  ] as const) {
    const point = MISSION[stage].position;
    expect(world.canOccupy(point, 1.8), stage).toBe(true);
    expect(nav.plan(previous, point), stage).toBeTruthy();
    previous = point;
  }
});

it.each([3, 4])(
  'completes the whole operation with %i humans and waits for every living teammate at extraction',
  (count) => {
    const { player, world } = fixture();
    const squad = Array.from({ length: count }, (_, i) => ({
      ...structuredClone(player),
      id: `p${i}`,
    }));
    const s = emptyMission(1);
    enterMissionStage(s, 'dispatch', count);
    for (const stage of [
      'dispatch',
      'cell',
      'deliver',
      'switch',
      'defend',
      'override',
    ] as const) {
      expect(s.stage).toBe(stage);
      squad[0]!.position = { ...missionPoint(s) };
      const held = new Set([squad[0]!.id]);
      stepMission(s, MISSION[stage].seconds, squad, held, world);
    }
    expect(s.stage).toBe('extract');
    squad[0]!.position = { ...MISSION.extract.position };
    stepMission(s, 4, squad, new Set(), world);
    expect(s.stage).toBe('extract');
    expect(s.boarded).toBe(1);
    expect(s.required).toBe(count);
    for (const p of squad) p.position = { ...MISSION.extract.position };
    stepMission(s, 4, squad, new Set(), world);
    expect(s.stage).toBe('departing');
    stepMission(s, 9, squad, new Set(), world);
    expect(s.stage).toBe('complete');
  },
);

it('requires held input, life, ground level and visibility; engineers are optional and progress does not stack', () => {
  const { player, world } = fixture();
  const s = emptyMission();
  enterMissionStage(s, 'dispatch', 3);
  player.position = { ...MISSION.dispatch.position };
  stepMission(s, 4, [player], new Set(), world);
  expect(s.progress).toBe(0);
  player.position.y = 4.03;
  stepMission(s, 4, [player], new Set(['p']), world);
  expect(s.progress).toBe(0);
  player.position = { x: 9, y: 0.16, z: 3 };
  stepMission(s, 4, [player], new Set(['p']), world);
  expect(s.progress).toBe(0);
  player.position = { ...MISSION.dispatch.position };
  stepMission(
    s,
    1,
    [player, { ...player, id: 'friend' }],
    new Set(['p', 'friend']),
    world,
  );
  expect(s.progress).toBe(1);
  stepMission(s, 3, [player], new Set(['p']), world);
  expect(s.stage).toBe('cell');
});

it('drops the cargo when its carrier dies or disconnects and allows a teammate to recover it', () => {
  const { player, world } = fixture();
  const s = emptyMission();
  enterMissionStage(s, 'cell', 2);
  player.position = { ...MISSION.cell.position };
  const friend = { ...player, id: 'friend' };
  stepMission(s, 1, [player, friend], new Set(['p']), world);
  expect(s.carrierId).toBe('p');
  stepMission(
    s,
    0.1,
    [{ ...player, connected: false }, friend],
    new Set(),
    world,
  );
  expect(s.stage).toBe('cell');
  expect(s.carrierId).toBe('');
  expect(s.cargo.x).toBe(player.position.x);
  expect(s.cargo.z).toBe(player.position.z);
  expect(Math.abs(s.cargo.y - player.position.y)).toBeLessThan(0.05);
  stepMission(s, 1, [friend], new Set(['friend']), world);
  expect(s.carrierId).toBe('friend');
});

it('pauses boarding near enemies, fails a timed objective, and preserves the checkpoint', () => {
  const { player, world } = fixture();
  const s = emptyMission();
  enterMissionStage(s, 'defend', 3);
  player.position = { ...MISSION.defend.position };
  const enemy: PlayerSnapshot = {
    ...player,
    id: 'enemy',
    bot: true,
    ally: false,
  };
  stepMission(s, 10, [player, enemy], new Set(), world);
  expect(s.progress).toBe(0);
  stepMission(s, MISSION.defend.seconds, [player], new Set(), world);
  expect(s.stage).toBe('override');
  stepMission(s, 100, [player], new Set(), world);
  expect(s.stage).toBe('failed');
  expect(s.checkpoint).toBe('override');
});

it('starts in a locked map, synchronizes late joins, respects squad limits and clears mission on mode change', () => {
  const { game } = fixture();
  send(game, { type: 'setMode', mode: 'mission' });
  send(game, { type: 'ready', ready: true });
  tick(game);
  expect(game.snapshot().mission?.stage).toBe('dispatch');
  expect(game.snapshot().mapId).toBe('bastion');
  expect(game.snapshot().players.filter((p) => p.ally)).toHaveLength(2);
  for (let i = 1; i <= 4; i++)
    game.enqueue({ type: 'join', playerId: `p${i}`, nickname: `Friend${i}` });
  tick(game);
  expect(game.snapshot().players.filter((p) => !p.bot)).toHaveLength(4);
  expect(game.snapshot().players.length).toBeLessThanOrEqual(8);
  send(game, { type: 'restartMission' }, 'p1');
  tick(game);
  expect(game.snapshot().mission?.runId).toBe(1);
  send(game, { type: 'setMode', mode: 'control' });
  tick(game);
  expect(game.snapshot().mission?.stage).toBe('idle');
  expect(game.snapshot().mission?.carrierId).toBe('');
  expect(
    clientCommandSchema.safeParse({
      type: 'input',
      seq: 1,
      yaw: 0,
      pitch: 0,
      interacting: true,
      buttons: {
        forward: false,
        back: false,
        left: false,
        right: false,
        jump: false,
        crouch: false,
      },
    }).success,
  ).toBe(true);
});

it('walks and interacts through every chapter using normal inputs on the real collision map', () => {
  // Long human spawn protection isolates routing/objective wiring from aim balance.
  const game = createGame(
    { ...DEFAULT_CONFIG, protectionSeconds: 1000 },
    TEST_PAD,
    0,
  );
  resources.push(game);
  const ids = ['p', 'p1', 'p2'];
  for (const id of ids)
    game.enqueue({ type: 'join', playerId: id, nickname: id });
  send(game, { type: 'setMode', mode: 'mission' });
  send(game, { type: 'setAllies', count: 0 });
  send(game, { type: 'setBots', count: 2, difficulty: 'easy' });
  for (const id of ids) {
    send(game, { type: 'selectWeapon', weapon: 'lmg' }, id);
    send(game, { type: 'ready', ready: true }, id);
  }
  tick(game);
  const world = createCollisionWorld(getMap('bastion'));
  resources.push(world);
  const navigation = createNavigation(getMap('bastion'), world);
  const brains = ids.map((_, i) => createBotBrain(i));
  const visited = new Set<string>();
  for (let frame = 0; frame < 36000; frame++) {
    const snapshot = game.snapshot();
    const mission = snapshot.mission!;
    visited.add(mission.stage);
    if (mission.stage === 'complete' || mission.stage === 'failed') break;
    ids.forEach((id, i) => {
      const player = snapshot.players.find((p) => p.id === id)!;
      const decision = brains[i]!.update(
        player,
        snapshot.players.filter((p) => p.bot && !p.ally),
        world,
        navigation,
        'hard',
        1 / 60,
        frame,
        {
          team: 'defenders',
          directive: {
            key: `mission:${mission.serial}`,
            position: missionPoint(mission),
            radius: 1.5,
          },
        },
      );
      send(game, { ...decision.input, interacting: true }, id);
      if (decision.reload) send(game, { type: 'reload' }, id);
      if (decision.fire)
        send(
          game,
          {
            type: 'fire',
            inputSeq: decision.input.seq,
            yaw: decision.input.yaw,
            pitch: decision.input.pitch,
          },
          id,
        );
    });
    tick(game);
  }
  const final = game.snapshot();
  expect(
    final.mission?.stage,
    JSON.stringify({
      mission: final.mission,
      players: final.players.map((p) => ({
        id: p.id,
        position: p.position,
        health: p.health,
        ammo: p.ammo,
        reserve: p.reserveAmmo,
      })),
    }),
  ).toBe('complete');
  expect([...visited]).toEqual([
    'dispatch',
    'cell',
    'deliver',
    'switch',
    'defend',
    'override',
    'extract',
    'departing',
    'complete',
  ]);
}, 60000);
