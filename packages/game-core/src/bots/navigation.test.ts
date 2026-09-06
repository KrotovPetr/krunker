import { beforeAll, expect, it } from 'vitest';
import { createCollisionWorld, initializePhysics, TEST_PAD } from '../index.js';
import type { MapDefinition } from '../index.js';
import { createNavigation, visible } from './navigation.js';

beforeAll(initializePhysics);
it('does not attach a goal inside a wall to a nearby floor node', () => {
  const map: MapDefinition = {
    ...TEST_PAD,
    blocks: [
      ...TEST_PAD.blocks,
      {
        id: 'wall',
        shape: 'box',
        yaw: 0,
        color: 0,
        position: { x: 0, y: 2, z: 0 },
        size: { x: 1, y: 4, z: 8 },
      },
    ],
  };
  const world = createCollisionWorld(map);
  try {
    const nav = createNavigation(map, world);
    expect(
      nav.plan({ x: -3, y: 0.03, z: 0 }, { x: 0, y: 0.03, z: 0 }),
    ).toBeUndefined();
    const route = nav.plan({ x: -3, y: 0.03, z: 0 }, { x: 3, y: 0.03, z: 0 });
    expect(route).toBeDefined();
    expect(route!.waypoints.some((p) => Math.abs(p.z) > 4)).toBe(true);
    expect(route!.destination).toEqual({ x: 3, y: 0.03, z: 0 });
  } finally {
    world.dispose();
  }
});
it('distinguishes a reached destination from an unreachable one', () => {
  const world = createCollisionWorld(TEST_PAD);
  try {
    const nav = createNavigation(TEST_PAD, world);
    const position = { x: 1, y: 0.04, z: 1 };
    expect(nav.plan(position, position)).toMatchObject({
      destination: position,
      length: 0,
    });
    expect(nav.plan(position, { x: 100, y: 0.04, z: 100 })).toBeUndefined();
  } finally {
    world.dispose();
  }
});
it('routes to reachable pickup range instead of the top of a supply box', () => {
  const map: MapDefinition = {
    ...TEST_PAD,
    supplies: [{ x: 5, y: 0.6, z: 3 }],
    blocks: [
      ...TEST_PAD.blocks,
      {
        id: 'supply',
        shape: 'box',
        yaw: 0,
        color: 0,
        position: { x: 5, y: 0.2, z: 3 },
        size: { x: 0.9, y: 0.4, z: 0.65 },
      },
    ],
  };
  const world = createCollisionWorld(map);
  try {
    const nav = createNavigation(map, world),
      from = { x: -3, y: 0.03, z: 3 };
    const destination = nav.supply(from)!;
    expect(destination).toBeDefined();
    expect(world.canOccupy(destination, 1.8)).toBe(true);
    const eye = { ...destination, y: destination.y + 1 },
      box = map.supplies![0]!;
    expect(
      Math.hypot(eye.x - box.x, eye.y - box.y, eye.z - box.z),
    ).toBeLessThan(2.6);
    expect(visible(world, eye, box)).toBe(true);
    expect(nav.plan(from, destination)).toBeDefined();
  } finally {
    world.dispose();
  }
});
