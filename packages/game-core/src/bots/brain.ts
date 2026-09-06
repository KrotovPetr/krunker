import type {
  BotDifficulty,
  InputCommand,
  PlayerSnapshot,
  Vec3,
} from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import type { MapDefinition } from '../maps/arena.js';
import { EMPTY_BUTTONS, playerHeight } from '../movement/controller.js';

const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
export function visible(world: CollisionWorld, from: Vec3, to: Vec3) {
  const length = distance(from, to);
  if (length < 0.01) return true;
  return (
    world.raycast(
      from,
      {
        x: (to.x - from.x) / length,
        y: (to.y - from.y) / length,
        z: (to.z - from.z) / length,
      },
      length,
    ) >=
    length - 0.02
  );
}
/** A small static walk graph. Paths are bounded by map size and shared by all bots. */
export function createNavigation(map: MapDefinition, world: CollisionWorld) {
  const floor = map.blocks.find((b) => b.id === 'floor') ?? map.blocks[0]!;
  const nodes: Vec3[] = [];
  const grid = new Map<string, number[]>();
  const keys: [number, number][] = [];
  const width = Math.min(40, Math.floor(floor.size.x / 2));
  const depth = Math.min(36, Math.floor(floor.size.z / 2));
  for (let x = -width + 1; x < width; x += 2)
    for (let z = -depth + 1; z < depth; z += 2) {
      for (const sampleHeight of map.navigationHeights ?? [4.9]) {
        const origin = {
          x: floor.position.x + x,
          y: sampleHeight,
          z: floor.position.z + z,
        };
        const depth = sampleHeight + 1;
        const height = world.raycast(origin, { x: 0, y: -1, z: 0 }, depth);
        const point = { ...origin, y: origin.y - height + 0.04 };
        // A capsule may straddle two stair treads. Use its highest support surface.
        if (map.navigationHeights)
          for (const [dx, dz] of [
            [0.3, 0],
            [-0.3, 0],
            [0, 0.3],
            [0, -0.3],
          ]) {
            const support = world.raycast(
              { ...origin, x: origin.x + dx!, z: origin.z + dz! },
              { x: 0, y: -1, z: 0 },
              depth,
            );
            point.y = Math.max(point.y, origin.y - support + 0.04);
          }
        const cell = grid.get(`${x},${z}`) ?? [];
        if (
          height < depth &&
          world.canOccupy(point, 1.8) &&
          cell.every((i) => Math.abs(nodes[i]!.y - point.y) > 0.1)
        ) {
          cell.push(nodes.length);
          grid.set(`${x},${z}`, cell);
          keys.push([x, z]);
          nodes.push(point);
        }
      }
    }
  const neighbors = nodes.map((point, index) => {
    const [x, z] = keys[index]!;
    const out: number[] = [];
    for (const [dx, dz] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]) {
      for (const next of grid.get(`${x + dx!},${z + dz!}`) ?? []) {
        const end = nodes[next]!;
        if (Math.abs(end.y - point.y) > (map.navigationHeights ? 1.05 : 0.9))
          continue;
        const height = Math.max(end.y, point.y) + 0.8;
        if (
          [-0.36, 0, 0.36].every((offset) =>
            visible(
              world,
              {
                x: point.x + (dz ? offset : 0),
                y: height,
                z: point.z + (dx ? offset : 0),
              },
              {
                x: end.x + (dz ? offset : 0),
                y: height,
                z: end.z + (dx ? offset : 0),
              },
            ),
          )
        )
          out.push(next);
      }
    }
    return out;
  });
  const nearest = (point: Vec3) => {
    let best = -1,
      length = Infinity;
    nodes.forEach((node, i) => {
      const d = distance(node, point);
      if (d < length) {
        best = i;
        length = d;
      }
    });
    return best;
  };
  return {
    patrol(index: number): Vec3 {
      const points = [...(map.defense?.players ?? []), ...map.spawns];
      return (
        points[Math.abs(index) % points.length] ??
        nodes[0] ?? { x: 0, y: 0, z: 0 }
      );
    },
    supply(from: Vec3): Vec3 | undefined {
      return [...(map.supplies ?? [])].sort(
        (a, b) => distance(a, from) - distance(b, from),
      )[0];
    },
    path(from: Vec3, to: Vec3): Vec3[] {
      const start = nearest(from),
        end = nearest(to);
      if (start < 0 || end < 0) return [];
      const parents = new Map<number, number>([[start, -1]]);
      const queue = [start];
      for (let i = 0; i < queue.length && !parents.has(end); i++)
        for (const neighbor of neighbors[queue[i]!]!)
          if (!parents.has(neighbor)) {
            parents.set(neighbor, queue[i]!);
            queue.push(neighbor);
          }
      if (!parents.has(end)) return [];
      const result: Vec3[] = [];
      for (let n = end; n !== start; n = parents.get(n)!)
        result.push(nodes[n]!);
      return result.reverse();
    },
  };
}
export function createBotBrain(id: number) {
  let path: Vec3[] = [],
    replan = 0,
    seenFor = 0,
    targetId = '',
    jumpCooldown = 0;
  let lastSeen: Vec3 | undefined,
    memory = 0,
    burst = 0,
    pause = 0,
    patrol = id;
  const settings = {
    easy: { reaction: 0.95, error: 0.05, turn: 1.3 },
    normal: { reaction: 0.7, error: 0.027, turn: 1.8 },
    hard: { reaction: 0.45, error: 0.014, turn: 2.4 },
  };
  return {
    update(
      player: PlayerSnapshot,
      players: PlayerSnapshot[],
      world: CollisionWorld,
      navigation: ReturnType<typeof createNavigation>,
      difficulty: BotDifficulty,
      dt: number,
      tick: number,
    ): { input: InputCommand; fire: boolean; reload: boolean } {
      const input: InputCommand = {
        type: 'input',
        seq: player.lastProcessedInput + 1,
        yaw: player.yaw,
        pitch: player.pitch,
        buttons: { ...EMPTY_BUTTONS },
      };
      const candidates = players
        .filter(
          (p) => p.id !== player.id && p.ready && p.connected && p.health > 0,
        )
        .sort(
          (a, b) =>
            distance(a.position, player.position) -
            distance(b.position, player.position),
        );
      const eye = {
        ...player.position,
        y: player.position.y + playerHeight(player) - 0.15,
      };
      const body = (p: PlayerSnapshot) => ({
        ...p.position,
        y: p.position.y + playerHeight(p) * 0.55,
      });
      const target = candidates.find((p) => {
        const bearing = Math.atan2(
          -(p.position.x - eye.x),
          -(p.position.z - eye.z),
        );
        return (
          (Math.abs(angle(bearing - player.yaw)) < 1.2 ||
            distance(p.position, player.position) < 5) &&
          visible(world, eye, body(p))
        );
      });
      if (player.health <= 0) return { input, fire: false, reload: false };
      const canSee = !!target;
      memory = Math.max(0, memory - dt);
      pause = Math.max(0, pause - dt);
      if (target) {
        if (targetId !== target.id) {
          seenFor = 0;
          replan = 0;
          burst = 0;
        }
        targetId = target.id;
        lastSeen = { ...target.position };
        memory = 3;
      } else seenFor = 0;
      const supply =
        player.reserveAmmo === 0 && player.ammo < 3
          ? navigation.supply(player.position)
          : undefined;
      const objective =
        supply ??
        (memory > 0 && lastSeen ? lastSeen : navigation.patrol(patrol));
      if (!target && distance(player.position, objective) < 2) {
        patrol++;
        replan = 0;
      }
      replan -= dt;
      jumpCooldown -= dt;
      if (replan <= 0) {
        // A flanker approaches an offset corner; it never reads a hidden target's live position.
        const flank =
          !supply &&
          memory > 0 &&
          id % 3 === 1 &&
          distance(player.position, objective) > 12;
        path = navigation.path(
          player.position,
          flank
            ? {
                ...objective,
                x: objective.x + (id % 2 ? 6 : -6),
                z: objective.z + 4,
              }
            : objective,
        );
        replan = 0.8 + (id % 5) * 0.05;
      }
      while (
        path[0] &&
        Math.hypot(
          path[0].x - player.position.x,
          path[0].z - player.position.z,
        ) < 0.65
      )
        path.shift();
      const waypoint = path[0] ?? objective;
      const look = target ? body(target) : { ...waypoint, y: eye.y };
      const dx = look.x - eye.x,
        dz = look.z - eye.z;
      const cfg = settings[difficulty];
      const error = Math.sin(tick * 0.071 + id * 13) * cfg.error;
      const desiredYaw = Math.atan2(-dx, -dz) + error;
      const desiredPitch =
        Math.atan2(look.y - eye.y, Math.hypot(dx, dz)) + error * 0.4;
      input.yaw = angle(
        player.yaw +
          Math.max(
            -cfg.turn * dt,
            Math.min(cfg.turn * dt, angle(desiredYaw - player.yaw)),
          ),
      );
      input.pitch =
        player.pitch +
        Math.max(
          -cfg.turn * dt,
          Math.min(cfg.turn * dt, desiredPitch - player.pitch),
        );
      input.aiming = canSee;
      const range = distance(player.position, target?.position ?? objective);
      const preferredRange =
        player.weapon === 'shotgun'
          ? 7
          : player.weapon === 'smg'
            ? 10
            : player.weapon === 'sniper'
              ? 30
              : 17 + (id % 3) * 3;
      if (supply || !canSee || range > preferredRange) {
        const mx = waypoint.x - player.position.x,
          mz = waypoint.z - player.position.z;
        const length = Math.max(0.01, Math.hypot(mx, mz));
        const forward =
          (-Math.sin(input.yaw) * mx - Math.cos(input.yaw) * mz) / length;
        const right =
          (Math.cos(input.yaw) * mx - Math.sin(input.yaw) * mz) / length;
        input.buttons.forward = forward > 0.35;
        input.buttons.back = forward < -0.35;
        input.buttons.right = right > 0.35;
        input.buttons.left = right < -0.35;
        if (
          player.grounded &&
          jumpCooldown <= 0 &&
          (waypoint.y > player.position.y + 0.25 ||
            Math.hypot(player.velocity.x, player.velocity.z) < 0.5)
        ) {
          input.buttons.jump = true;
          jumpCooldown = 1;
        }
      } else {
        const strafe = Math.sin(tick / 65 + id * 2);
        input.buttons.left =
          id % 3 !== 0 && player.weapon !== 'sniper' && strafe < -0.4;
        input.buttons.right =
          id % 3 !== 0 && player.weapon !== 'sniper' && strafe > 0.4;
        input.buttons.back = range < preferredRange * 0.45;
      }
      const settled =
        Math.abs(angle(desiredYaw - input.yaw)) < 0.12 &&
        Math.abs(desiredPitch - input.pitch) < 0.12;
      seenFor = canSee && settled ? seenFor + dt : 0;
      const fire =
        !!target &&
        !supply &&
        target.protectionRemaining <= 0 &&
        seenFor >= cfg.reaction &&
        pause <= 0 &&
        settled &&
        player.ammo > 0 &&
        player.reloadRemaining === 0;
      if (fire && player.fireRemaining <= dt) {
        burst++;
        if (
          burst >=
          (player.weapon === 'smg' ? 5 : player.weapon === 'rifle' ? 3 : 1)
        ) {
          pause = player.weapon === 'sniper' ? 1.3 : 0.55 + (id % 3) * 0.12;
          burst = 0;
        }
      }
      return {
        input,
        fire,
        reload:
          player.ammo === 0 &&
          player.reserveAmmo > 0 &&
          player.reloadRemaining === 0,
      };
    },
  };
}
