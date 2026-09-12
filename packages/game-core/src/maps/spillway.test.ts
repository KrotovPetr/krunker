import { beforeAll, expect, it } from 'vitest';
import {
  SPILLWAY,
  createCollisionWorld,
  createGame,
  DEFAULT_CONFIG,
  getMap,
  initializePhysics,
  EMPTY_BUTTONS,
  mapLocalPoint,
} from '../index.js';
import { createNavigation, visible } from '../bots/brain.js';
import type { ClientCommand } from '@fps/protocol';

beforeAll(initializePhysics);

it('supports both authored bridge positions instead of leaving them suspended over the channel', () => {
  const world = createCollisionWorld(SPILLWAY);
  try {
    for (const id of ['bridge-overwatch', 'bridge-advance']) {
      const point = SPILLWAY.tacticalPositions!.find(
        (p) => p.id === id,
      )!.position;
      const drop = world.raycast(
        { ...point, y: point.y + 0.1 },
        { x: 0, y: -1, z: 0 },
        2,
      );
      expect(drop, id).toBeLessThan(0.2);
    }
  } finally {
    world.dispose();
  }
});

it('joins retaining-wall segments at their authored corners', () => {
  const a = SPILLWAY.blocks.find((b) => b.id === 'channel-outer-west-a')!;
  const b = SPILLWAY.blocks.find((b) => b.id === 'channel-outer-west-b')!;
  const end = (block: typeof a, side: number) => ({
    x: block.position.x + (side * Math.cos(block.yaw) * block.size.x) / 2,
    z: block.position.z - (side * Math.sin(block.yaw) * block.size.x) / 2,
  });
  const p = end(a, 1),
    q = end(b, -1);
  expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThan(0.01);
});

it('walks across the bridge from the west landing onto the east spillway without falling', () => {
  const bridge = SPILLWAY.blocks.find((b) => b.id === 'bridge-deck')!;
  const start = mapLocalPoint(bridge, -26, 0, -1);
  start.y = 3.03;
  const game = createGame(
    DEFAULT_CONFIG,
    { ...SPILLWAY, spawns: [start, ...SPILLWAY.spawns.slice(1)] },
    0,
  );
  try {
    game.enqueue({ type: 'join', playerId: 'walker', nickname: 'Walker' });
    game.step(1 / 60);
    for (let i = 0; i < 390; i++) {
      game.enqueue({
        type: 'playerCommand',
        playerId: 'walker',
        command: {
          type: 'input',
          seq: i + 1,
          yaw: bridge.yaw - Math.PI / 2,
          pitch: 0,
          buttons: { ...EMPTY_BUTTONS, forward: true },
        },
      });
      game.step(1 / 60);
      expect(game.snapshot().players[0]!.position.y).toBeGreaterThan(2.9);
      if (game.snapshot().players[0]!.position.x > 24) break;
    }
    expect(game.snapshot().players[0]!.position.x).toBeGreaterThan(24);
  } finally {
    game.dispose();
  }
});

it('leaves room to enter the southern turbine ramp without spawning inside its solid', () => {
  const world = createCollisionWorld(SPILLWAY);
  try {
    expect(world.canOccupy({ x: 20, y: 0.03, z: 31.5 }, 1.8)).toBe(true);
  } finally {
    world.dispose();
  }
});

it.each([-31, 27])('walks from the channel up the dam slope at x=%s', (x) => {
  const start = { x, y: 0.03, z: x < 0 ? 2 : 6 };
  const game = createGame(
    DEFAULT_CONFIG,
    { ...SPILLWAY, spawns: [start, ...SPILLWAY.spawns.slice(1)] },
    0,
  );
  try {
    game.enqueue({ type: 'join', playerId: 'walker', nickname: 'Walker' });
    game.step(1 / 60);
    for (let i = 0; i < 200; i++) {
      game.enqueue({
        type: 'playerCommand',
        playerId: 'walker',
        command: {
          type: 'input',
          seq: i + 1,
          yaw: 0,
          pitch: 0,
          buttons: { ...EMPTY_BUTTONS, forward: true },
        },
      });
      game.step(1 / 60);
    }
    expect(game.snapshot().players[0]!.position.y).toBeGreaterThan(5.9);
  } finally {
    game.dispose();
  }
});

it('registers Spillway and accepts it as an authoritative map', () => {
  expect(getMap('spillway')).toBe(SPILLWAY);
  const game = createGame(DEFAULT_CONFIG, getMap('switchyard'), 0);
  const send = (command: ClientCommand) =>
    game.enqueue({ type: 'playerCommand', playerId: 'host', command });
  try {
    game.enqueue({ type: 'join', playerId: 'host', nickname: 'Host' });
    game.step(1 / 60);
    send({ type: 'setMap', mapId: 'spillway' });
    game.step(1 / 60);
    expect(game.snapshot().mapId).toBe('spillway');
  } finally {
    game.dispose();
  }
});

it('keeps every spawn and authored tactical position unobstructed', () => {
  const world = createCollisionWorld(SPILLWAY);
  try {
    const points = [
      ...SPILLWAY.spawns,
      ...SPILLWAY.defense!.players,
      ...SPILLWAY.defense!.enemies,
      ...SPILLWAY.tacticalPositions!.map((point) => point.position),
    ];
    expect(points.filter((point) => !world.canOccupy(point, 1.8))).toEqual([]);
  } finally {
    world.dispose();
  }
});

it('connects the quarry, collector, turbine and dam for bots', () => {
  const world = createCollisionWorld(SPILLWAY);
  try {
    const navigation = createNavigation(SPILLWAY, world);
    const collector = { x: -15, y: 0.03, z: 5 };
    for (const point of SPILLWAY.tacticalPositions!)
      expect(
        navigation.plan(collector, point.position),
        point.id,
      ).toBeDefined();
    const points = [
      { x: -26, y: 6.03, z: -19 },
      { x: -30, y: 0.03, z: 1 },
      { x: 4, y: 0.03, z: 17 },
      { x: 14, y: 0.03, z: 5 },
      { x: 22, y: 3.03, z: 24 },
    ];
    expect(
      points.filter((point) => navigation.path(collector, point).length <= 2),
    ).toEqual([]);
    const damPath = navigation.path(
      { x: -30, y: 0.03, z: 1 },
      { x: -26, y: 6.03, z: -19 },
    );
    expect(damPath.some((point) => point.y > 5.5)).toBe(true);
    const turbinePath = navigation.path(
      { x: 4, y: 0.03, z: 17 },
      { x: 22, y: 3.03, z: 24 },
    );
    expect(turbinePath.some((point) => point.y > 2.5)).toBe(true);
  } finally {
    world.dispose();
  }
});

it('breaks the long surface and collector sightlines', () => {
  const world = createCollisionWorld(SPILLWAY);
  try {
    expect(
      visible(world, { x: -26, y: 7.68, z: -19 }, { x: 22, y: 4.68, z: 24 }),
    ).toBe(false);
    expect(
      visible(world, { x: -15, y: 1.65, z: 5 }, { x: 14, y: 1.65, z: 5 }),
    ).toBe(false);
    expect(
      visible(world, { x: 6.5, y: 1.65, z: 9 }, { x: 6.5, y: 1.65, z: 17 }),
    ).toBe(false);
  } finally {
    world.dispose();
  }
});
