import { beforeAll, expect, it } from 'vitest';
import {
  CITY,
  SANDGATE,
  createCollisionWorld,
  createGame,
  DEFAULT_CONFIG,
  initializePhysics,
  predictPlayerMovement,
} from '../index.js';
import { createBotBrain, createNavigation } from './brain.js';

beforeAll(initializePhysics);
it.each([CITY, SANDGATE])(
  'physically reaches every tactical position from every wave entrance on $id',
  (map) => {
    const world = createCollisionWorld(map),
      game = createGame(DEFAULT_CONFIG, map, 0);
    try {
      const navigation = createNavigation(map, world);
      game.enqueue({ type: 'join', playerId: 'walker', nickname: 'Walker' });
      game.step(1 / 60);
      const sample = game.snapshot().players[0]!;
      for (const [gateIndex, gate] of map.defense!.enemies.entries())
        for (const point of map.tacticalPositions!) {
          const player = structuredClone(sample);
          player.position = { ...gate };
          player.ready = true;
          const brain = createBotBrain(0);
          // Keep one destination, but execute real planning, steering and physics.
          const singleGoal = { ...navigation, positions: [point] };
          let reached = false;
          for (let tick = 0; tick < 1200; tick++) {
            if (
              Math.hypot(
                player.position.x - point.position.x,
                player.position.y - point.position.y,
                player.position.z - point.position.z,
              ) < 0.9
            ) {
              reached = true;
              break;
            }
            const decision = brain.update(
              player,
              [],
              world,
              singleGoal,
              'normal',
              1 / 60,
              tick,
            );
            Object.assign(
              player,
              predictPlayerMovement(player, decision.input, 1 / 60, world),
            );
          }
          expect(
            reached,
            `gate ${gateIndex} -> ${point.id}: ${JSON.stringify(player.position)}`,
          ).toBe(true);
        }
    } finally {
      world.dispose();
      game.dispose();
    }
  },
);
