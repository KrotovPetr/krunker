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

it('opens both buildings and keeps the street below the gallery clear', () => {
  const world = createCollisionWorld(CITY);
  try {
    for (const point of [
      ...CITY.spawns,
      ...CITY.tacticalPositions!.map((p) => p.position),
      ...CITY.defense!.players,
    ])
      expect(world.canOccupy(point, 1.8), JSON.stringify(point)).toBe(true);
    for (const [x, z] of [
      [-19, -15],
      [-19, 3],
      [-10, -7],
      [18, -7],
      [18, 13],
      [10, 4],
      [0, -5],
    ] as const)
      expect(world.canOccupy({ x, y: 0.16, z }, 1.8), x + ',' + z).toBe(true);
    expect(
      visible(world, { x: 0, y: 1.8, z: 0 }, { x: 0, y: 1.8, z: -10 }),
    ).toBe(true);
    expect(
      visible(world, { x: -3, y: 1.8, z: 20 }, { x: -3, y: 1.8, z: 0 }),
    ).toBe(false);
  } finally {
    world.dispose();
  }
});
it('connects all wave entrances to every tactical position and conceals initial spawns', () => {
  const world = createCollisionWorld(CITY);
  try {
    const nav = createNavigation(CITY, world);
    for (const gate of CITY.defense!.enemies) {
      expect(world.canOccupy(gate, 1.8)).toBe(true);
      for (const defender of CITY.defense!.players)
        expect(
          visible(
            world,
            { ...defender, y: defender.y + 1.65 },
            { ...gate, y: gate.y + 1.65 },
          ),
          JSON.stringify({ gate, defender }),
        ).toBe(false);
      for (const point of CITY.tacticalPositions!)
        expect(
          nav.plan(gate, point.position),
          JSON.stringify({ gate, point: point.id }),
        ).toBeDefined();
    }
    const crossing = nav.path(
      { x: -14, y: 4.03, z: -5 },
      { x: 14, y: 4.03, z: -5 },
    );
    expect(crossing.length).toBeGreaterThan(5);
    expect(crossing.every((p) => p.y > 3.8)).toBe(true);
  } finally {
    world.dispose();
  }
});
it.each([
  { name: 'depot', x: -7, z: 12, yaw: 0, turn: Math.PI / 2, endX: -11 },
  {
    name: 'station',
    x: 28.5,
    z: -18,
    yaw: Math.PI,
    turn: Math.PI / 2,
    endX: 25,
  },
])(
  'climbs the $name stair and steps onto its terrace',
  ({ x, z, yaw, turn, endX }) => {
    const game = createGame(
      DEFAULT_CONFIG,
      { ...CITY, spawns: [{ x, y: 0.16, z }, ...CITY.spawns.slice(1)] },
      0,
    );
    try {
      game.enqueue({ type: 'join', playerId: 'host', nickname: 'Walker' });
      game.step(1 / 60);
      let seq = 0;
      const walk = (angle: number, ticks: number) => {
        for (let i = 0; i < ticks; i++) {
          game.enqueue({
            type: 'playerCommand',
            playerId: 'host',
            command: {
              type: 'input',
              seq: ++seq,
              yaw: angle,
              pitch: 0,
              buttons: { ...EMPTY_BUTTONS, forward: true },
            },
          });
          game.step(1 / 60);
        }
      };
      walk(yaw, 240);
      expect(game.snapshot().players[0]!.position.y).toBeGreaterThan(3.9);
      walk(turn, 50);
      const position = game.snapshot().players[0]!.position;
      expect(position.x).toBeLessThan(endX);
      expect(position.y).toBeGreaterThan(3.9);
    } finally {
      game.dispose();
    }
  },
);
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
    for (let i = 0; i < 160; i++) {
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
      expect(Math.abs(p.position.x)).toBeLessThan(32);
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
