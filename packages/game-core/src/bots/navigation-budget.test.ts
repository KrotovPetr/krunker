import { beforeAll, expect, it } from 'vitest';
import { initializePhysics, createCollisionWorld, CITY } from '../index.js';
import { createNavigation, createNavigationTask } from './navigation.js';

beforeAll(initializePhysics);
it('bounds each preparation slice and produces the same routes as synchronous navigation', () => {
  const world = createCollisionWorld(CITY);
  try {
    let queries = 0;
    const counted = {
      ...world,
      raycast: (...args: Parameters<typeof world.raycast>) => {
        queries++;
        return world.raycast(...args);
      },
      canOccupy: (...args: Parameters<typeof world.canOccupy>) => {
        queries++;
        return world.canOccupy(...args);
      },
    };
    const task = createNavigationTask(CITY, counted);
    expect(queries).toBe(0);
    let navigation: ReturnType<typeof createNavigation> | undefined;
    let slices = 0;
    while (!navigation && slices < 200) {
      queries = 0;
      navigation = task.advance(16);
      expect(queries).toBeLessThan(1500);
      slices++;
    }
    expect(slices).toBeGreaterThan(1);
    expect(navigation).toBeDefined();
    const reference = createNavigation(CITY, world);
    for (const start of CITY.control!.allies.slice(0, 3))
      for (const end of [CITY.control!.position, ...CITY.spawns.slice(0, 3)])
        expect(navigation!.plan(start, end)).toEqual(
          reference.plan(start, end),
        );
    expect(task.advance()).toBe(navigation);
  } finally {
    world.dispose();
  }
});
