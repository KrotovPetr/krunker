import { beforeAll, expect, it } from 'vitest';
import {
  ARENA,
  initializePhysics,
  createCollisionWorld,
  createGame,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
} from '../index.js';
import { createNavigation } from '../bots/brain.js';

beforeAll(initializePhysics);
it.each([-1, 1])(
  'walks under the %s platform without crouching and retains its upper surface',
  (side) => {
    const world = createCollisionWorld(ARENA);
    const game = createGame(
      DEFAULT_CONFIG,
      {
        ...ARENA,
        practice: { spawns: [], targets: [] },
        spawns: [
          { x: -side * 5, y: 0.03, z: side * 11 },
          ...ARENA.spawns.slice(1),
        ],
      },
      0,
    );
    try {
      for (let z = 13; z <= 21; z++)
        expect(
          world.canOccupy({ x: -side * 5, y: 0.03, z: side * z }, 1.8),
        ).toBe(true);
      expect(
        world.canOccupy({ x: -side * 5, y: 3.03, z: side * 17 }, 1.8),
      ).toBe(true);
      expect(world.canOccupy({ x: -side * 5, y: 2.8, z: side * 17 }, 0.2)).toBe(
        false,
      );
      const nav = createNavigation(ARENA, world);
      const path = nav.path(
        { x: -side * 5, y: 0.03, z: side * 11 },
        { x: -side * 5, y: 0.03, z: side * 23 },
      );
      expect(path.length).toBeGreaterThan(4);
      expect(path.every((p) => p.y < 0.3 && Math.abs(p.x + side * 5) < 3)).toBe(
        true,
      );
      game.enqueue({ type: 'join', playerId: 'walker', nickname: 'Walker' });
      game.step(1 / 60);
      for (let i = 0; i < 110; i++) {
        game.enqueue({
          type: 'playerCommand',
          playerId: 'walker',
          command: {
            type: 'input',
            seq: i + 1,
            yaw: side < 0 ? 0 : Math.PI,
            pitch: 0,
            buttons: { ...EMPTY_BUTTONS, forward: true },
          },
        });
        game.step(1 / 60);
      }
      const player = game.snapshot().players[0]!;
      expect(player.position.z * side).toBeGreaterThan(21.5);
      expect(player.position.y).toBeLessThan(0.3);
      expect(player.crouched).toBe(false);
    } finally {
      game.dispose();
      world.dispose();
    }
  },
);
