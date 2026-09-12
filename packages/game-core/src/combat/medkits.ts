import type { PlayerSnapshot, Vec3 } from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import { visible } from '../bots/brain.js';
export const MEDKIT = {
  health: 35,
  cooldown: 25,
  radius: 2.2,
  damageDelay: 3,
} as const;
export function useMedkit(
  player: PlayerSnapshot,
  points: readonly Vec3[],
  world: CollisionWorld,
) {
  if (
    !player.ready ||
    !player.connected ||
    player.health <= 0 ||
    player.health >= player.maxHealth ||
    player.healthCooldown > 0
  )
    return 0;
  const eye = { ...player.position, y: player.position.y + 1 };
  if (
    !points.some(
      (p) =>
        Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) < MEDKIT.radius &&
        visible(world, eye, p),
    )
  )
    return 0;
  const amount = Math.min(MEDKIT.health, player.maxHealth - player.health);
  player.health += amount;
  player.healthCooldown = MEDKIT.cooldown;
  return amount;
}
