import { beforeAll, expect, it } from 'vitest';
import {
  createGame,
  createCollisionWorld,
  DEFAULT_CONFIG,
  initializePhysics,
  TEST_PAD,
} from '../index.js';
import type { ClientCommand, GameEvent } from '@fps/protocol';
import { createGrenades } from './grenades.js';
import { useMedkit } from './medkits.js';
beforeAll(initializePhysics);
function fixture() {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0);
  game.enqueue({ type: 'join', playerId: 'owner', nickname: 'Owner' });
  game.step(1 / 60);
  const owner = game.snapshot().players[0]!;
  game.dispose();
  return Object.assign(owner, {
    ready: true,
    grounded: true,
    protectionRemaining: 0,
    position: { x: 0, y: 0.03, z: 0 },
  });
}
it('spends one grenade, bounces on the floor, explodes once and respects teams, shields and walls', () => {
  const world = createCollisionWorld(TEST_PAD);
  try {
    for (const scenario of ['hostile', 'friendly', 'shield', 'wall'] as const) {
      const owner = fixture(),
        g = createGrenades(),
        target = { ...fixture(), id: 'target' };
      expect(
        g.throw({ ...owner, health: 0 }, world, { yaw: 0, pitch: 1.57 }),
      ).toBe(false);
      expect(g.throw(owner, world, { yaw: 0, pitch: Math.PI / 2 })).toBe(true);
      expect(owner.grenades).toBe(0);
      expect(g.throw(owner, world, { yaw: 0, pitch: 0 })).toBe(false);
      target.position = { x: 0.6, y: 0.03, z: 0 };
      if (scenario === 'shield') target.protectionRemaining = 2;
      const players = new Map([
        [owner.id, owner],
        [target.id, target],
      ]);
      const hits: number[] = [];
      let explosions = 0;
      const collision =
        scenario === 'wall' ? { ...world, raycast: () => 0 } : world;
      for (let i = 0; i < 180; i++) {
        g.step(
          1 / 60,
          players,
          collision,
          () => scenario !== 'friendly',
          (_, __, victims) => {
            explosions++;
            hits.push(...victims.map((v) => v.damage));
          },
        );
        for (const p of g.snapshot()) expect(p.position.y).toBeGreaterThan(0.1);
      }
      expect(explosions).toBe(1);
      expect(hits).toHaveLength(scenario === 'hostile' ? 1 : 0);
      if (hits.length) expect(hits[0]).toBeGreaterThan(70);
      expect(g.snapshot()).toEqual([]);
    }
  } finally {
    world.dispose();
  }
});
it('sweeps against thin walls and removes disconnected or previous-life projectiles', () => {
  const world = createCollisionWorld({
    ...TEST_PAD,
    blocks: [
      ...TEST_PAD.blocks,
      {
        id: 'wall',
        shape: 'box',
        yaw: 0,
        position: { x: 0, y: 2, z: -2 },
        size: { x: 12, y: 4, z: 0.1 },
        color: 0,
      },
    ],
  });
  try {
    const owner = fixture(),
      g = createGrenades(),
      players = new Map([[owner.id, owner]]);
    expect(g.throw(owner, world, { yaw: 0, pitch: 0 })).toBe(true);
    for (let i = 0; i < 30; i++) {
      g.step(
        1 / 60,
        players,
        world,
        () => true,
        () => {},
      );
      expect(g.snapshot()[0]!.position.z).toBeGreaterThan(-1.95);
    }
    owner.lifeId++;
    g.step(
      1 / 60,
      players,
      world,
      () => true,
      () => {},
    );
    expect(g.snapshot()).toEqual([]);
    owner.grenades = 1;
    g.throw(owner, world, { yaw: 0, pitch: 0 });
    owner.connected = false;
    g.step(
      1 / 60,
      players,
      world,
      () => true,
      () => {},
    );
    expect(g.snapshot()).toEqual([]);
  } finally {
    world.dispose();
  }
});
it('medkits require injury, proximity, sight and cooldown, never exceed max health', () => {
  const world = createCollisionWorld(TEST_PAD),
    p = fixture(),
    kits = [{ x: 1, y: 0.6, z: 0 }];
  try {
    expect(useMedkit(p, kits, world)).toBe(0);
    p.health = 80;
    expect(useMedkit(p, kits, { ...world, raycast: () => 0 })).toBe(0);
    expect(useMedkit(p, [{ x: 9, y: 0.6, z: 0 }], world)).toBe(0);
    expect(useMedkit(p, kits, world)).toBe(20);
    expect(p.health).toBe(100);
    expect(p.healthCooldown).toBe(25);
    p.health = 20;
    expect(useMedkit(p, kits, world)).toBe(0);
    p.healthCooldown = 0;
    expect(useMedkit(p, kits, world)).toBe(35);
    p.health = 0;
    p.healthCooldown = 0;
    expect(useMedkit(p, kits, world)).toBe(0);
  } finally {
    world.dispose();
  }
});
it('server accepts throws only in combat, rejects spam and clears them on map changes', () => {
  const game = createGame(
    {
      ...DEFAULT_CONFIG,
      maxPlayers: 2,
      protectionSeconds: 0,
      roundSeconds: 0.5,
    },
    TEST_PAD,
    0,
  );
  const send = (command: ClientCommand, playerId = 'owner') =>
    game.enqueue({ type: 'playerCommand', playerId, command });
  try {
    for (const id of ['owner', 'target'])
      game.enqueue({ type: 'join', playerId: id, nickname: id });
    game.step(1 / 60);
    send({ type: 'throwGrenade', yaw: 0, pitch: 0 });
    game.step(1 / 60);
    expect(game.snapshot().grenades).toHaveLength(0);
    for (const id of ['owner', 'target'])
      send({ type: 'ready', ready: true }, id);
    game.step(1 / 60);
    send({ type: 'throwGrenade', yaw: 0, pitch: Math.PI / 2 });
    send({ type: 'throwGrenade', yaw: 0, pitch: 0 });
    const events: GameEvent[] = game.step(1 / 60);
    expect(events.filter((e) => e.type === 'grenadeThrown')).toHaveLength(1);
    expect(game.snapshot().grenades).toHaveLength(1);
    expect(game.snapshot().players[0]!.grenades).toBe(0);
    // End the human match, then a host map change resets inventory and projectiles.
    for (let i = 0; i < 35; i++) game.step(1 / 60);
    expect(game.snapshot().phase).toBe('results');
    send({ type: 'setMap', mapId: 'bastion' });
    game.step(1 / 60);
    expect(game.snapshot().grenades).toEqual([]);
    expect(game.snapshot().players[0]!.grenades).toBe(1);
  } finally {
    game.dispose();
  }
});
