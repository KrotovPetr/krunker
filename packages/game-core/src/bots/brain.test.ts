import { beforeAll, expect, it } from 'vitest';
import {
  createGame,
  createCollisionWorld,
  DEFAULT_CONFIG,
  initializePhysics,
  TEST_PAD,
  predictPlayerMovement,
} from '../index.js';
import type { MapDefinition } from '../index.js';
import { createBotBrain, createNavigation } from './brain.js';
beforeAll(initializePhysics);
it('reaches ordered positions, holds them, follows a moved destination and bounds replanning', () => {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0),
    world = createCollisionWorld(TEST_PAD);
  try {
    game.enqueue({ type: 'join', playerId: 'p', nickname: 'Ally' });
    game.step(1 / 60);
    const player = game.snapshot().players[0]!;
    Object.assign(player, {
      ready: true,
      position: { x: 0, y: 0.03, z: 0 },
      yaw: 0,
    });
    const brain = createBotBrain(0),
      nav = createNavigation(TEST_PAD, world);
    let plans = 0;
    const counted = {
      ...nav,
      plan: (...args: Parameters<typeof nav.plan>) => {
        plans++;
        return nav.plan(...args);
      },
    };
    const directive = {
      key: 'order:1',
      position: { x: 0, y: 0.03, z: -5 },
      radius: 1.3,
    };
    const simulate = (from: number, to: number) => {
      for (let tick = from; tick < to; tick++) {
        const decision = brain.update(
          player,
          [],
          world,
          counted,
          'normal',
          1 / 60,
          tick,
          { team: 'defenders', directive },
        );
        Object.assign(
          player,
          predictPlayerMovement(player, decision.input, 1 / 60, world),
        );
      }
    };
    simulate(0, 240);
    expect(Math.hypot(player.position.x, player.position.z + 5)).toBeLessThan(
      1.4,
    );
    const stopped = { ...player.position };
    simulate(240, 360);
    expect(
      Math.hypot(player.position.x - stopped.x, player.position.z - stopped.z),
    ).toBeLessThan(0.1);
    directive.position = { x: 5, y: 0.03, z: -5 };
    simulate(360, 720);
    expect(
      Math.hypot(player.position.x - 5, player.position.z + 5),
    ).toBeLessThan(1.4);
    expect(plans).toBeLessThan(20);
    brain.update(player, [], world, counted, 'normal', 1 / 60, 721, {});
    expect(brain.intent().goalId).not.toBe('order:1');
  } finally {
    game.dispose();
    world.dispose();
  }
});
it('machine gunners stop strafing in their firing range', () => {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0),
    world = createCollisionWorld(TEST_PAD);
  try {
    game.enqueue({ type: 'join', playerId: 'p', nickname: 'Gunner' });
    game.step(1 / 60);
    const player = game.snapshot().players[0]!;
    Object.assign(player, {
      weapon: 'lmg',
      position: { x: 0, y: 0.03, z: 0 },
      yaw: 0,
      ready: true,
      protectionRemaining: 0,
    });
    const target = {
      ...structuredClone(player),
      id: 'target',
      position: { x: 0, y: 0.03, z: -18 },
    };
    const brain = createBotBrain(1),
      nav = createNavigation(TEST_PAD, world);
    let shots = 0;
    for (let tick = 0; tick < 180; tick++) {
      const decision = brain.update(
        player,
        [target],
        world,
        nav,
        'normal',
        1 / 60,
        tick,
      );
      expect(decision.input.buttons.left).toBe(false);
      expect(decision.input.buttons.right).toBe(false);
      if (decision.fire) shots++;
      player.yaw = decision.input.yaw;
      player.pitch = decision.input.pitch;
    }
    expect(shots).toBeGreaterThan(0);
  } finally {
    game.dispose();
    world.dispose();
  }
});
it('needs a settled aim and reaction window before firing, and never snaps around', () => {
  const g = createGame(DEFAULT_CONFIG, TEST_PAD, 0),
    world = createCollisionWorld(TEST_PAD);
  try {
    g.enqueue({ type: 'join', playerId: 'p', nickname: 'P' });
    g.step(1 / 60);
    const p = g.snapshot().players[0]!;
    Object.assign(p, {
      position: { x: 0, y: 0.03, z: 0 },
      yaw: 0,
      ready: true,
      protectionRemaining: 0,
    });
    const target = {
      ...structuredClone(p),
      id: 'target',
      position: { x: 0, y: 0.03, z: -10 },
    };
    const nav = createNavigation(TEST_PAD, world),
      brain = createBotBrain(0);
    let first = -1;
    for (let i = 0; i < 120; i++) {
      const d = brain.update(p, [target], world, nav, 'normal', 1 / 60, i);
      const delta = Math.atan2(
        Math.sin(d.input.yaw - p.yaw),
        Math.cos(d.input.yaw - p.yaw),
      );
      expect(Math.abs(delta)).toBeLessThanOrEqual(1.8 / 60 + 1e-9);
      if (d.fire && first === -1) first = i;
      p.yaw = d.input.yaw;
      p.pitch = d.input.pitch;
    }
    expect(first).toBeGreaterThanOrEqual(40);
    expect(first).toBeLessThan(120);
    target.position = { x: 0, y: 0.03, z: 10 };
    expect(
      brain.update(p, [target], world, nav, 'normal', 1 / 60, 121).fire,
    ).toBe(false);
  } finally {
    g.dispose();
    world.dispose();
  }
});

it('abandons a stalled destination and keeps it out of the next plan', () => {
  const map: MapDefinition = {
    ...TEST_PAD,
    tacticalPositions: [
      { id: 'north', role: 'advance', position: { x: 1, y: 0.04, z: -7 } },
      { id: 'south', role: 'advance', position: { x: 1, y: 0.04, z: 7 } },
      { id: 'east', role: 'advance', position: { x: 7, y: 0.04, z: 1 } },
    ],
  };
  const game = createGame(DEFAULT_CONFIG, map, 0),
    world = createCollisionWorld(map);
  try {
    game.enqueue({ type: 'join', playerId: 'p', nickname: 'P' });
    game.step(1 / 60);
    const p = game.snapshot().players[0]!;
    Object.assign(p, { position: { x: 1, y: 0.04, z: 1 }, ready: true });
    const brain = createBotBrain(0),
      nav = createNavigation(map, world);
    brain.update(p, [], world, nav, 'normal', 1 / 60, 0);
    const first = brain.intent().goalId;
    expect(first).toBe('north');
    // Keep the actual position fixed, as when physics cannot execute a route.
    for (let i = 1; i < 190; i++) {
      const decision = brain.update(p, [], world, nav, 'normal', 1 / 60, i);
      p.yaw = decision.input.yaw;
      p.pitch = decision.input.pitch;
    }
    expect(brain.intent().goalId).toBeDefined();
    expect(brain.intent().goalId).not.toBe(first);
    for (let i = 190; i < 260; i++) {
      const decision = brain.update(p, [], world, nav, 'normal', 1 / 60, i);
      Object.assign(p, predictPlayerMovement(p, decision.input, 1 / 60, world));
      expect(brain.intent().goalId).not.toBe(first);
    }
  } finally {
    game.dispose();
    world.dispose();
  }
});

it('takes a different approach when a teammate has claimed a position', () => {
  const map: MapDefinition = {
    ...TEST_PAD,
    tacticalPositions: [
      { id: 'left', role: 'advance', position: { x: -5, y: 0.04, z: -5 } },
      { id: 'right', role: 'advance', position: { x: 5, y: 0.04, z: -5 } },
    ],
  };
  const game = createGame(DEFAULT_CONFIG, map, 0),
    world = createCollisionWorld(map);
  try {
    game.enqueue({ type: 'join', playerId: 'p', nickname: 'P' });
    game.step(1 / 60);
    const p = game.snapshot().players[0]!;
    Object.assign(p, { position: { x: 0, y: 0.04, z: 3 }, ready: true });
    const nav = createNavigation(map, world),
      first = createBotBrain(0),
      second = createBotBrain(0);
    first.update(p, [], world, nav, 'normal', 1 / 60, 0, { team: 'attackers' });
    second.update(p, [], world, nav, 'normal', 1 / 60, 0, {
      team: 'attackers',
      occupied: [first.intent().destination!],
    });
    expect(first.intent().goalId).toBe('left');
    expect(second.intent().goalId).toBe('right');
  } finally {
    game.dispose();
    world.dispose();
  }
});

it('seeks cover from a known threat when wounded and forgets it on respawn', () => {
  const map: MapDefinition = {
    ...TEST_PAD,
    blocks: [
      ...TEST_PAD.blocks,
      {
        id: 'cover',
        shape: 'box',
        yaw: 0,
        color: 0,
        position: { x: 0, y: 1.6, z: 0 },
        size: { x: 6, y: 3.2, z: 0.5 },
      },
    ],
    tacticalPositions: [
      { id: 'shelter', role: 'guard', position: { x: 1, y: 0.04, z: 3 } },
      { id: 'exposed', role: 'advance', position: { x: 1, y: 0.04, z: -3 } },
    ],
  };
  const game = createGame(DEFAULT_CONFIG, map, 0),
    world = createCollisionWorld(map);
  try {
    game.enqueue({ type: 'join', playerId: 'p', nickname: 'P' });
    game.step(1 / 60);
    const p = game.snapshot().players[0]!;
    Object.assign(p, {
      position: { x: 5, y: 0.04, z: -3 },
      yaw: 0.8,
      ready: true,
      health: 20,
    });
    const target = {
      ...structuredClone(p),
      id: 'enemy',
      health: 100,
      position: { x: 1, y: 0.04, z: -7 },
    };
    const nav = createNavigation(map, world),
      brain = createBotBrain(0);
    const decision = brain.update(p, [target], world, nav, 'normal', 1 / 60, 0);
    expect(brain.intent()).toMatchObject({ state: 'cover', goalId: 'shelter' });
    expect(decision.fire).toBe(false);
    p.lifeId++;
    p.health = 100;
    brain.update(p, [], world, nav, 'normal', 1 / 60, 1);
    expect(brain.intent().state).toBe('patrol');
  } finally {
    game.dispose();
    world.dispose();
  }
});
it('does not use an unseen enemy position to choose a route', () => {
  const g = createGame(DEFAULT_CONFIG, TEST_PAD, 0),
    world = createCollisionWorld(TEST_PAD);
  try {
    g.enqueue({ type: 'join', playerId: 'p', nickname: 'P' });
    g.step(1 / 60);
    const p = g.snapshot().players[0]!;
    p.position = { x: 0, y: 0.03, z: 0 };
    p.yaw = 0;
    p.ready = true;
    const target = {
      ...structuredClone(p),
      id: 'target',
      position: { x: 0, y: 0.03, z: 15 },
    };
    const nav = createNavigation(TEST_PAD, world);
    const a = createBotBrain(0).update(
      p,
      [target],
      world,
      nav,
      'normal',
      1 / 60,
      1,
    );
    target.position = { x: 8, y: 0.03, z: 18 };
    const b = createBotBrain(0).update(
      p,
      [target],
      world,
      nav,
      'normal',
      1 / 60,
      1,
    );
    expect(a).toEqual(b);
    expect(a.fire).toBe(false);
  } finally {
    g.dispose();
    world.dispose();
  }
});
