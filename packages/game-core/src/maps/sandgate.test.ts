import { beforeAll, expect, it } from 'vitest';
import {
  SANDGATE,
  CITY,
  createCollisionWorld,
  initializePhysics,
  createGame,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
} from '../index.js';
import { createNavigation, visible } from '../bots/brain.js';
import type { ClientCommand } from '@fps/protocol';
beforeAll(initializePhysics);
it('has safe spawns and connected routes through long, middle and tunnels', () => {
  const world = createCollisionWorld(SANDGATE);
  try {
    for (const point of [
      ...SANDGATE.spawns,
      ...SANDGATE.defense!.players,
      ...SANDGATE.defense!.enemies,
    ])
      expect(world.canOccupy(point, 1.8), JSON.stringify(point)).toBe(true);
    const navigation = createNavigation(SANDGATE, world);
    const start = { x: 0, y: 0.03, z: 18 };
    for (const end of SANDGATE.defense!.enemies)
      expect(
        navigation.path(start, end).length,
        JSON.stringify(end),
      ).toBeGreaterThan(3);
    for (const point of [
      { x: 21, y: 0.03, z: 0 },
      { x: -20, y: 0.03, z: 0 },
      { x: 0, y: 0.03, z: -7 },
      { x: 6, y: 0.83, z: 0 },
      { x: 6, y: 0.83, z: -7 },
    ])
      expect(world.canOccupy(point, 1.8), JSON.stringify(point)).toBe(true);
    expect(
      visible(world, { x: 0, y: 1.65, z: 18 }, { x: 0, y: 1.65, z: -18 }),
    ).toBe(false);
  } finally {
    world.dispose();
  }
});
it('runs enemies through the desert routes and resets to the training map for a challenge', () => {
  const game = createGame(
    {
      ...DEFAULT_CONFIG,
      wavePreparationSeconds: 0.1,
      waveSpawnSeconds: 0.1,
      protectionSeconds: 0,
    },
    SANDGATE,
    0,
  );
  const send = (command: ClientCommand) =>
    game.enqueue({ type: 'playerCommand', playerId: 'host', command });
  try {
    game.enqueue({ type: 'join', playerId: 'host', nickname: 'Host' });
    send({ type: 'setMode', mode: 'waves' });
    send({ type: 'ready', ready: true });
    let hits = 0;
    for (let i = 0; i < 5400 && !hits; i++)
      hits += game.step(1 / 60).filter((e) => e.type === 'hit').length;
    expect(hits).toBeGreaterThan(0);
    send({ type: 'setMode', mode: 'training' });
    game.step(1 / 60);
    expect(game.snapshot().mapId).toBe('switchyard');
  } finally {
    game.dispose();
  }
});
it('climbs the new western stair and can step onto the Bastion roof', () => {
  const game = createGame(
    DEFAULT_CONFIG,
    {
      ...CITY,
      spawns: [{ x: -11.5, y: 0.03, z: -8 }, ...CITY.spawns.slice(1)],
    },
    0,
  );
  try {
    game.enqueue({ type: 'join', playerId: 'host', nickname: 'Host' });
    game.step(1 / 60);
    for (let i = 0; i < 250; i++) {
      game.enqueue({
        type: 'playerCommand',
        playerId: 'host',
        command: {
          type: 'input',
          seq: i + 1,
          yaw: Math.PI,
          pitch: 0,
          buttons: { ...EMPTY_BUTTONS, forward: true },
        },
      });
      game.step(1 / 60);
    }
    expect(game.snapshot().players[0]!.position.y).toBeGreaterThan(4.7);
    for (let i = 0; i < 35; i++) {
      game.enqueue({
        type: 'playerCommand',
        playerId: 'host',
        command: {
          type: 'input',
          seq: 251 + i,
          yaw: -Math.PI / 2,
          pitch: 0,
          buttons: { ...EMPTY_BUTTONS, forward: true },
        },
      });
      game.step(1 / 60);
    }
    expect(game.snapshot().players[0]!.position.x).toBeGreaterThan(-9);
    expect(game.snapshot().players[0]!.position.y).toBeGreaterThan(4.7);
  } finally {
    game.dispose();
  }
});

it('connects expanded rear streets and both approaches to the lookout terraces', () => {
  const world = createCollisionWorld(SANDGATE);
  try {
    const navigation = createNavigation(SANDGATE, world);
    for (const side of [-1, 1]) {
      const terrace = { x: side * 30.8, y: 1.23, z: -17 };
      expect(world.canOccupy(terrace, 1.8)).toBe(true);
      for (const start of [
        { x: side * 30.8, y: 0.03, z: -9 },
        { x: side * 30.8, y: 0.03, z: -25 },
      ]) {
        const path = navigation.path(start, terrace);
        expect(path.length).toBeGreaterThan(1);
        expect(path.at(-1)!.y).toBeGreaterThan(1);
      }
    }
    expect(
      navigation.path({ x: -29, y: 0.03, z: -25 }, { x: 29, y: 0.03, z: -25 })
        .length,
    ).toBeGreaterThan(20);
  } finally {
    world.dispose();
  }
});
