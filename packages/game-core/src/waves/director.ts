import type { PlayerSnapshot, Vec3, WaveSnapshot } from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import { visible } from '../bots/brain.js';
export function emptyWave(runId = 0): WaveSnapshot {
  return {
    number: 0,
    status: 'idle',
    remaining: 0,
    alive: 0,
    queued: 0,
    total: 0,
    cleared: 0,
    runId,
  };
}
export function waveSize(number: number, base = 3) {
  return Math.min(30, base + (number - 1) * 2);
}
export function chooseEnemySpawn(
  points: readonly Vec3[],
  humans: PlayerSnapshot[],
  enemies: PlayerSnapshot[],
  world: CollisionWorld,
  concealedOnly = false,
): Vec3 | undefined {
  let best: Vec3 | undefined,
    score = -Infinity;
  for (const point of points) {
    const distance = Math.min(
      ...humans.map((p) =>
        Math.hypot(p.position.x - point.x, p.position.z - point.z),
      ),
    );
    if (
      distance < 10 ||
      enemies.some(
        (p) =>
          p.health > 0 &&
          Math.hypot(p.position.x - point.x, p.position.z - point.z) < 2,
      )
    )
      continue;
    const exposed = humans.some((p) =>
      visible(
        world,
        { ...p.position, y: p.position.y + 1.6 },
        { ...point, y: point.y + 1.6 },
      ),
    );
    if (concealedOnly && exposed) continue;
    const value = distance + (exposed ? 0 : 15);
    if (value > score) {
      score = value;
      best = point;
    }
  }
  return best;
}

/** Respawn behind cover when possible; distance breaks ties within that tier. */
export function chooseRespawn(
  points: readonly Vec3[],
  opponents: readonly PlayerSnapshot[],
  world: CollisionWorld,
): Vec3 {
  let best = points[0]!;
  let bestExposed = Infinity;
  let bestDistance = -Infinity;
  for (const point of points) {
    const nearest = Math.min(
      ...opponents.map((p) =>
        Math.hypot(
          point.x - p.position.x,
          point.y - p.position.y,
          point.z - p.position.z,
        ),
      ),
    );
    const exposed = opponents.reduce(
      (count, p) =>
        count +
        Number(
          visible(
            world,
            { ...p.position, y: p.position.y + 1.65 },
            { ...point, y: point.y + 1.65 },
          ),
        ),
      0,
    );
    if (nearest < 2) continue;
    if (
      exposed < bestExposed ||
      (exposed === bestExposed && nearest > bestDistance)
    ) {
      best = point;
      bestExposed = exposed;
      bestDistance = nearest;
    }
  }
  return best;
}
