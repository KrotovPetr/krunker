import { beforeAll, expect, it } from 'vitest';
import {
  SANDGATE,
  createCollisionWorld,
  initializePhysics,
  createGame,
  DEFAULT_CONFIG,
} from '../index.js';
import { createNavigation, visible } from '../bots/brain.js';
import type { ClientCommand } from '@fps/protocol';
beforeAll(initializePhysics);

it('has safe spawns and connected market, courtyard and gallery destinations', () => {
  const world = createCollisionWorld(SANDGATE);
  try {
    for (const point of [
      ...SANDGATE.spawns,
      ...SANDGATE.defense!.players,
      ...SANDGATE.defense!.enemies,
      ...SANDGATE.tacticalPositions!.map((p) => p.position),
    ])
      expect(world.canOccupy(point, 1.8), JSON.stringify(point)).toBe(true);
    const nav = createNavigation(SANDGATE, world);
    for (const start of SANDGATE.defense!.enemies)
      for (const end of SANDGATE.tacticalPositions!)
        expect(nav.plan(start, end.position), end.id).toBeDefined();
    expect(SANDGATE.blocks.length).toBeLessThan(110);
    expect(new Set(SANDGATE.blocks.map((b) => b.id)).size).toBe(
      SANDGATE.blocks.length,
    );
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

it('keeps the market side exits and lower arcade open without crouching', () => {
  const world = createCollisionWorld(SANDGATE);
  try {
    for (const [start, finish] of [
      [
        { x: 15, y: 1.7, z: 12 },
        { x: 15, y: 1.7, z: -12 },
      ],
      [
        { x: -14, y: 1.7, z: 6 },
        { x: -9, y: 1.7, z: 6 },
      ],
      [
        { x: -14, y: 1.7, z: -1.5 },
        { x: -9, y: 1.7, z: -1.5 },
      ],
      [
        { x: -10, y: 1.7, z: -16 },
        { x: -10, y: 1.7, z: -12 },
      ],
    ])
      expect(visible(world, start!, finish!)).toBe(true);
    for (let z = -12; z <= 12; z++)
      expect(world.canOccupy({ x: 15, y: 0.03, z }, 1.8)).toBe(true);
    // Facades join the boundaries: no empty full-perimeter ring.
    expect(world.canOccupy({ x: -30, y: 0.03, z: -3 }, 1.8)).toBe(false);
    expect(world.canOccupy({ x: 30, y: 0.03, z: 3 }, 1.8)).toBe(false);
  } finally {
    world.dispose();
  }
});

it('breaks the main sightline and prevents one balcony from seeing every wave entrance', () => {
  const world = createCollisionWorld(SANDGATE);
  try {
    expect(
      visible(world, { x: 0, y: 1.65, z: 18 }, { x: 0, y: 1.65, z: -20 }),
    ).toBe(false);
    expect(
      visible(world, { x: -19, y: 1.65, z: 10 }, { x: -19, y: 1.65, z: -10 }),
    ).toBe(false);
    for (const p of SANDGATE.tacticalPositions!.filter(
      (p) => p.role === 'overwatch',
    )) {
      const eye = { ...p.position, y: p.position.y + 1.65 };
      expect(
        SANDGATE.defense!.enemies.filter((g) =>
          visible(world, eye, { ...g, y: g.y + 1.65 }),
        ).length,
        p.id,
      ).toBeLessThanOrEqual(2);
    }
  } finally {
    world.dispose();
  }
});
