import { beforeAll, expect, it } from 'vitest';
import {
  ARENA,
  CITY,
  SANDGATE,
  createCollisionWorld,
  createMovementState,
  initializePhysics,
  mapLocalPoint,
  predictPlayerMovement,
  EMPTY_BUTTONS,
} from '../index.js';

beforeAll(initializePhysics);
const ramps = [CITY, SANDGATE, ARENA].flatMap((map) =>
  map.blocks
    .filter((b) =>
      [
        'depot-ramp',
        'station-ramp',
        'gallery-ramp--1',
        'gallery-ramp-1',
        'north-east-ramp',
      ].includes(b.id),
    )
    .map((block) => ({ name: map.id + '/' + block.id, map, block })),
);
it('removes staircase solids while retaining five continuous replacements', () => {
  expect(ramps).toHaveLength(5);
  for (const map of [CITY, SANDGATE, ARENA])
    expect(map.blocks.some((b) => b.id.includes('-step-'))).toBe(false);
});
it.each(ramps)(
  'walks up and down $name without jumping or stair-height jolts',
  ({ map, block }) => {
    const world = createCollisionWorld(map);
    try {
      expect(block.shape).toBe('ramp');
      for (const fraction of [0.25, 0.5, 0.75]) {
        const p = mapLocalPoint(block, block.size.x * (fraction - 0.5), 0, 0);
        const surface =
          12 - world.raycast({ ...p, y: 12 }, { x: 0, y: -1, z: 0 }, 15);
        expect(surface).toBeCloseTo(
          block.position.y - block.size.y / 2 + block.size.y * fraction,
          3,
        );
      }
      const low = mapLocalPoint(
        block,
        -block.size.x / 2 - 0.5,
        -block.size.y / 2 + 0.04,
        0,
      );
      const high = mapLocalPoint(
        block,
        block.size.x / 2 + 0.4,
        block.size.y / 2 + 0.04,
        0,
      );
      for (const [start, end] of [
        [low, high],
        [high, low],
      ] as const) {
        let player = createMovementState(start),
          reached = false,
          largestStep = 0;
        const yaw = Math.atan2(-(end.x - start.x), -(end.z - start.z));
        for (let tick = 0; tick < 600; tick++) {
          const next = predictPlayerMovement(
            player,
            {
              type: 'input',
              seq: tick,
              yaw,
              pitch: 0,
              buttons: { ...EMPTY_BUTTONS, forward: true },
            },
            1 / 60,
            world,
          );
          if (tick > 10)
            largestStep = Math.max(
              largestStep,
              Math.abs(next.position.y - player.position.y),
            );
          player = next;
          if (
            Math.hypot(player.position.x - end.x, player.position.z - end.z) <
            0.2
          ) {
            reached = true;
            break;
          }
        }
        expect(
          reached,
          JSON.stringify({ start, end, actual: player.position }),
        ).toBe(true);
        expect(player.position.y).toBeCloseTo(end.y, 0);
        expect(largestStep).toBeLessThan(0.16);
        expect(player.crouched).toBe(false);
      }
    } finally {
      world.dispose();
    }
  },
);
