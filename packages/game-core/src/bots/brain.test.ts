import { beforeAll, expect, it } from 'vitest';
import {
  createGame,
  createCollisionWorld,
  DEFAULT_CONFIG,
  initializePhysics,
  TEST_PAD,
} from '../index.js';
import { createBotBrain, createNavigation } from './brain.js';
beforeAll(initializePhysics);
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
