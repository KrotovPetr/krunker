import { beforeAll, expect, it } from 'vitest';
import {
  CITY,
  ARENA,
  createCollisionWorld,
  initializePhysics,
  createGame,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
} from '../index.js';
import { createNavigation, visible } from '../bots/brain.js';
import type { ClientCommand } from '@fps/protocol';

beforeAll(initializePhysics);
it('has eight unobstructed spawns and all four entrances are open at standing height', () => {
  const world = createCollisionWorld(CITY);
  try {
    for (const point of CITY.spawns)
      expect(world.canOccupy(point, 1.8), JSON.stringify(point)).toBe(true);
    for (const point of [
      { x: 0, y: 0.16, z: 8 },
      { x: 0, y: 0.16, z: -8 },
      { x: -9, y: 0.16, z: 0 },
      { x: 9, y: 0.16, z: 0 },
    ])
      expect(world.canOccupy(point, 1.8)).toBe(true);
    expect(
      visible(world, { x: 0, y: 1.8, z: 15 }, { x: 0, y: 1.8, z: 0 }),
    ).toBe(true);
    expect(
      visible(world, { x: 3, y: 1.8, z: 15 }, { x: 3, y: 1.8, z: 0 }),
    ).toBe(false);
  } finally {
    world.dispose();
  }
});
it('connects streets, the atrium and the roof in bot navigation', () => {
  const world = createCollisionWorld(CITY);
  try {
    const navigation = createNavigation(CITY, world);
    const street = { x: 0, y: 0.16, z: 15 },
      hall = { x: 0, y: 0.16, z: 0 },
      roof = { x: 5, y: 4.83, z: -5 };
    const hallPath = navigation.path(street, hall),
      roofPath = navigation.path(street, roof);
    expect(hallPath.length).toBeGreaterThan(2);
    expect(hallPath.at(-1)!.y).toBeLessThan(1);
    expect(roofPath.length).toBeGreaterThan(5);
    expect(roofPath.at(-1)!.y).toBeGreaterThan(4.5);
  } finally {
    world.dispose();
  }
});
it('switches the authoritative map, resets lives and uses the new collisions', () => {
  const game = createGame(DEFAULT_CONFIG, ARENA, 0);
  const send = (command: ClientCommand, playerId = 'host') =>
    game.enqueue({ type: 'playerCommand', playerId, command });
  try {
    game.enqueue({ type: 'join', playerId: 'host', nickname: 'Host' });
    game.enqueue({ type: 'join', playerId: 'guest', nickname: 'Guest' });
    game.step(1 / 60);
    const life = game.snapshot().players[0]!.lifeId;
    send({ type: 'setMap', mapId: 'bastion' }, 'guest');
    expect(game.step(1 / 60)).toContainEqual({
      type: 'commandRejected',
      playerId: 'guest',
      reason: 'hostOnly',
    });
    send({ type: 'setMap', mapId: 'bastion' });
    game.step(1 / 60);
    expect(game.snapshot().mapId).toBe('bastion');
    expect(game.snapshot().players[0]!.lifeId).toBeGreaterThan(life);
    for (let i = 0; i < 100; i++) {
      send({
        type: 'input',
        seq: i + 1,
        yaw: 0,
        pitch: 0,
        buttons: { ...EMPTY_BUTTONS, forward: true },
      });
      game.step(1 / 60);
    }
    const local = game.snapshot().players[0]!;
    expect(local.position.z).toBeLessThan(4);
    expect(local.position.y).toBeGreaterThan(0);
    send({ type: 'setMode', mode: 'parkour' });
    game.step(1 / 60);
    expect(game.snapshot().mapId).toBe('switchyard');
    expect(game.snapshot().mode).toBe('parkour');
    send({ type: 'setMap', mapId: 'bastion' });
    game.step(1 / 60);
    expect(game.snapshot().mode).toBe('arena');
    expect(game.snapshot().mapId).toBe('bastion');
  } finally {
    game.dispose();
  }
});
it('lets a player climb the external stairs and step onto the roof', () => {
  const map = {
    ...CITY,
    spawns: [{ x: 11.5, y: 0.03, z: 8 }, ...CITY.spawns.slice(1)],
  };
  const game = createGame(DEFAULT_CONFIG, map, 0);
  const send = (command: ClientCommand) =>
    game.enqueue({ type: 'playerCommand', playerId: 'host', command });
  try {
    game.enqueue({ type: 'join', playerId: 'host', nickname: 'Host' });
    game.step(1 / 60);
    let seq = 0;
    for (let i = 0; i < 250; i++) {
      send({
        type: 'input',
        seq: ++seq,
        yaw: 0,
        pitch: 0,
        buttons: { ...EMPTY_BUTTONS, forward: true },
      });
      game.step(1 / 60);
    }
    expect(game.snapshot().players[0]!.position.y).toBeGreaterThan(4.7);
    for (let i = 0; i < 35; i++) {
      send({
        type: 'input',
        seq: ++seq,
        yaw: Math.PI / 2,
        pitch: 0,
        buttons: { ...EMPTY_BUTTONS, forward: true },
      });
      game.step(1 / 60);
    }
    expect(game.snapshot().players[0]!.position.x).toBeLessThan(9);
    expect(game.snapshot().players[0]!.position.y).toBeGreaterThan(4.7);
  } finally {
    game.dispose();
  }
});

it('bots fight in Bastion and a running human match rejects map changes', () => {
  const game = createGame({ ...DEFAULT_CONFIG, protectionSeconds: 0 }, CITY, 0);
  const send = (command: ClientCommand, playerId = 'host') =>
    game.enqueue({ type: 'playerCommand', playerId, command });
  try {
    game.enqueue({ type: 'join', playerId: 'host', nickname: 'Host' });
    send({ type: 'setMode', mode: 'bots' });
    game.step(1 / 60);
    game.step(1 / 60);
    send({ type: 'ready', ready: true });
    let hits = 0,
      kills = 0;
    for (let i = 0; i < 1800; i++)
      for (const event of game.step(1 / 60)) {
        if (event.type === 'hit') hits++;
        if (event.type === 'kill') kills++;
      }
    expect(hits).toBeGreaterThan(5);
    expect(kills).toBeGreaterThan(0);
    for (const p of game.snapshot().players) {
      expect(p.position.y).toBeGreaterThan(-1);
      expect(Math.abs(p.position.x)).toBeLessThan(28);
    }
    send({ type: 'setMode', mode: 'arena' });
    game.step(1 / 60);
    game.enqueue({ type: 'join', playerId: 'guest', nickname: 'Guest' });
    send({ type: 'ready', ready: true });
    send({ type: 'ready', ready: true }, 'guest');
    game.step(1 / 60);
    send({ type: 'setMap', mapId: 'switchyard' });
    expect(game.step(1 / 60)).toContainEqual({
      type: 'commandRejected',
      playerId: 'host',
      reason: 'matchRunning',
    });
    expect(game.snapshot().mapId).toBe('bastion');
  } finally {
    game.dispose();
  }
});

it('links the rear streets around both rows of city buildings', () => {
  const world = createCollisionWorld(CITY);
  try {
    const navigation = createNavigation(CITY, world);
    for (const side of [-1, 1]) {
      const path = navigation.path(
        { x: side * 30, y: 0.03, z: -20 },
        { x: side * 30, y: 0.03, z: 20 },
      );
      expect(path.length).toBeGreaterThan(15);
      expect(path.every((p) => world.canOccupy(p, 1.8))).toBe(true);
    }
  } finally {
    world.dispose();
  }
});
