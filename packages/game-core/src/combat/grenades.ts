import type { GrenadeSnapshot, PlayerSnapshot, Vec3 } from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import { visible } from '../bots/brain.js';
import { playerHeight } from '../movement/controller.js';

export const GRENADE = {
  fuse: 2.5,
  speed: 16,
  gravity: 18,
  radius: 0.12,
  blastRadius: 5,
  damage: 90,
  capacity: 8,
} as const;

/** Bounded, server-stepped projectiles. Swept segments cannot tunnel through walls. */
export function createGrenades() {
  const active = new Map<
    string,
    GrenadeSnapshot & { velocity: Vec3; lifeId: number; resting: boolean }
  >();
  let serial = 0;
  const removeOwner = (id: string) => {
    for (const [key, g] of active) if (g.ownerId === id) active.delete(key);
  };
  return {
    removeOwner,
    clear() {
      active.clear();
    },
    snapshot(): GrenadeSnapshot[] {
      return [...active.values()].map(
        ({ id, ownerId, position, remaining }) => ({
          id,
          ownerId,
          position: { ...position },
          remaining,
        }),
      );
    },
    throw(
      player: PlayerSnapshot,
      world: CollisionWorld,
      look: { yaw: number; pitch: number },
    ) {
      if (
        !player.ready ||
        !player.connected ||
        player.health <= 0 ||
        player.grenades < 1 ||
        player.reloadRemaining > 0 ||
        active.size >= GRENADE.capacity
      )
        return false;
      const position = {
        ...player.position,
        y: player.position.y + (player.crouched ? 0.85 : 1.4),
      };
      // Start inside the player's body volume, not on the other side of nearby cover.
      if (!world.canOccupy(player.position, playerHeight(player))) return false;
      const c = Math.cos(look.pitch),
        id = 'grenade:' + ++serial;
      active.set(id, {
        id,
        ownerId: player.id,
        position,
        remaining: GRENADE.fuse,
        lifeId: player.lifeId,
        resting: false,
        velocity: {
          x: -Math.sin(look.yaw) * c * GRENADE.speed,
          y: -Math.sin(look.pitch) * GRENADE.speed + 3,
          z: -Math.cos(look.yaw) * c * GRENADE.speed,
        },
      });
      player.grenades--;
      return true;
    },
    step(
      dt: number,
      players: ReadonlyMap<string, PlayerSnapshot>,
      world: CollisionWorld,
      hostile: (a: PlayerSnapshot, b: PlayerSnapshot) => boolean,
      explode: (
        owner: PlayerSnapshot,
        position: Vec3,
        hits: { target: PlayerSnapshot; damage: number }[],
      ) => void,
    ) {
      for (const [id, g] of active) {
        const owner = players.get(g.ownerId);
        if (
          !owner ||
          !owner.connected ||
          !owner.ready ||
          owner.health <= 0 ||
          owner.lifeId !== g.lifeId
        ) {
          active.delete(id);
          continue;
        }
        g.remaining -= dt;
        if (!g.resting) {
          g.velocity.y -= GRENADE.gravity * dt;
          const speed = Math.hypot(g.velocity.x, g.velocity.y, g.velocity.z);
          if (speed > 0.001) {
            const direction = {
              x: g.velocity.x / speed,
              y: g.velocity.y / speed,
              z: g.velocity.z / speed,
            };
            const hit = world.raycastSurface?.(
              g.position,
              direction,
              speed * dt + GRENADE.radius,
            );
            const distance = hit
              ? Math.max(0, hit.distance - GRENADE.radius)
              : speed * dt;
            g.position.x += direction.x * distance;
            g.position.y += direction.y * distance;
            g.position.z += direction.z * distance;
            if (hit) {
              const n = hit.normal,
                dot =
                  g.velocity.x * n.x + g.velocity.y * n.y + g.velocity.z * n.z;
              g.position.x += n.x * 0.005;
              g.position.y += n.y * 0.005;
              g.position.z += n.z * 0.005;
              g.velocity = {
                x: (g.velocity.x - 2 * dot * n.x) * 0.45,
                y: (g.velocity.y - 2 * dot * n.y) * 0.45,
                z: (g.velocity.z - 2 * dot * n.z) * 0.45,
              };
              if (
                n.y > 0.7 &&
                Math.hypot(g.velocity.x, g.velocity.y, g.velocity.z) < 0.8
              )
                g.resting = true;
            }
          }
        }
        if (g.remaining > 0) continue;
        active.delete(id);
        const hits: { target: PlayerSnapshot; damage: number }[] = [];
        for (const target of players.values()) {
          if (
            target.id === owner.id ||
            !hostile(owner, target) ||
            !target.connected ||
            !target.ready ||
            target.health <= 0 ||
            target.protectionRemaining > 0
          )
            continue;
          const chest = { ...target.position, y: target.position.y + 0.7 };
          const d = Math.hypot(
            chest.x - g.position.x,
            chest.y - g.position.y,
            chest.z - g.position.z,
          );
          if (d < GRENADE.blastRadius && visible(world, g.position, chest))
            hits.push({
              target,
              damage: Math.round(
                GRENADE.damage * Math.min(1, (GRENADE.blastRadius - d) / 4),
              ),
            });
        }
        explode(owner, g.position, hits);
      }
    },
  };
}
