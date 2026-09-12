import { beforeAll, expect, it } from 'vitest';
import { initializePhysics, createCollisionWorld, MOVEMENT } from '../index.js';
import { MAPS } from './catalog.js';
import { visible } from '../bots/brain.js';
beforeAll(initializePhysics);

it.each(Object.values(MAPS))(
  '$id has two ammo boxes and two reachable medkits',
  (map) => {
    expect(map.supplies).toHaveLength(2);
    expect(map.medkits).toHaveLength(2);
    const world = createCollisionWorld(map);
    try {
      for (const point of map.medkits!) {
        const accessible = Array.from({ length: 16 }, (_, i) => {
          const angle = (i * Math.PI) / 8;
          const position = {
            x: point.x + Math.cos(angle) * 1.2,
            y: point.y - 0.6 + 0.05,
            z: point.z + Math.sin(angle) * 1.2,
          };
          const floor = world.raycast(position, { x: 0, y: -1, z: 0 }, 0.2);
          return (
            world.canOccupy(position, MOVEMENT.standingHeight) &&
            floor < 0.2 &&
            visible(world, { ...position, y: position.y + 1 }, point)
          );
        });
        expect(
          accessible.some(Boolean),
          `${map.id}: medkit ${JSON.stringify(point)}`,
        ).toBe(true);
      }
    } finally {
      world.dispose();
    }
  },
);
