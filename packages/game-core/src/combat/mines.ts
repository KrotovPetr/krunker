import type { MineSnapshot, PlayerSnapshot, Vec3 } from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import { visible } from '../bots/brain.js';

export const MINE = {
  cooldown: 12,
  armSeconds: 1.2,
  lifetime: 40,
  perPlayer: 2,
  triggerRadius: 2.3,
  blastRadius: 4,
  damage: 120,
} as const;

/** At most two mines per player. No rigid bodies, timers or unbounded history. */
export function createMines() {
  const mines = new Map<
    string,
    MineSnapshot & {
      lifeId: number;
      age: number;
    }
  >();
  let serial = 0;
  const removeOwner = (id: string) => {
    for (const [key, mine] of mines) if (mine.ownerId === id) mines.delete(key);
  };
  return {
    removeOwner,
    destroy(id: string) {
      return mines.delete(id);
    },
    clear() {
      mines.clear();
    },
    snapshot(): MineSnapshot[] {
      return [...mines.values()].map(({ id, ownerId, position, armed }) => ({
        id,
        ownerId,
        position: { ...position },
        armed,
      }));
    },
    deploy(player: PlayerSnapshot, world: CollisionWorld): boolean {
      if (
        player.weapon !== 'sapper' ||
        !player.ready ||
        !player.connected ||
        player.health <= 0 ||
        !player.grounded ||
        player.mineCooldown > 0 ||
        [...mines.values()].filter((m) => m.ownerId === player.id).length >=
          MINE.perPlayer
      )
        return false;
      const origin = { ...player.position, y: player.position.y + 0.5 };
      const probe = {
        x: origin.x - Math.sin(player.yaw) * 0.85,
        y: origin.y,
        z: origin.z - Math.cos(player.yaw) * 0.85,
      };
      if (!visible(world, origin, probe)) return false;
      const down = world.raycastSurface?.(probe, { x: 0, y: -1, z: 0 }, 0.8);
      if (!down || down.normal.y < 0.9) return false;
      const position = { ...probe, y: probe.y - down.distance + 0.08 };
      if (!world.canOccupy(position, 0.9)) return false;
      const id = `mine:${++serial}`;
      mines.set(id, {
        id,
        ownerId: player.id,
        position,
        armed: false,
        lifeId: player.lifeId,
        age: 0,
      });
      player.mineCooldown = MINE.cooldown;
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
      for (const [id, mine] of mines) {
        const owner = players.get(mine.ownerId);
        mine.age += dt;
        if (
          !owner ||
          owner.lifeId !== mine.lifeId ||
          !owner.connected ||
          !owner.ready ||
          owner.health <= 0 ||
          owner.weapon !== 'sapper' ||
          mine.age >= MINE.lifetime
        ) {
          mines.delete(id);
          continue;
        }
        mine.armed = mine.age >= MINE.armSeconds;
        if (!mine.armed) continue;
        const candidates: { target: PlayerSnapshot; distance: number }[] = [];
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
          const distance = Math.hypot(
            chest.x - mine.position.x,
            chest.y - mine.position.y,
            chest.z - mine.position.z,
          );
          if (
            distance <= MINE.blastRadius &&
            visible(world, mine.position, chest)
          )
            candidates.push({ target, distance });
        }
        if (!candidates.some((c) => c.distance <= MINE.triggerRadius)) continue;
        mines.delete(id);
        explode(
          owner,
          mine.position,
          candidates.map(({ target, distance }) => ({
            target,
            damage: Math.round(
              MINE.damage * Math.min(1, (MINE.blastRadius - distance) / 2.5),
            ),
          })),
        );
      }
    },
  };
}
