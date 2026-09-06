import type { Vec3 } from '@fps/protocol';
import type { CollisionWorld } from '../movement/collision-world.js';
import type { MapDefinition } from '../maps/arena.js';
export interface NavigationRoute {
  waypoints: Vec3[];
  destination: Vec3;
  length: number;
}
export type TacticalPosition = NonNullable<
  MapDefinition['tacticalPositions']
>[number];
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
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
        let lowestSupport = point.y;
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
            const supportY = origin.y - support + 0.04;
            lowestSupport = Math.min(lowestSupport, supportY);
            point.y = Math.max(point.y, supportY);
          }
        const cell = grid.get(`${x},${z}`) ?? [];
        if (
          height < depth &&
          // A stair may span two treads; a thin parapet above a drop is not a
          // walking surface. Do not route a capsule along its narrow top.
          point.y - lowestSupport <= 0.55 &&
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
        const support = Math.max(end.y, point.y);
        if (
          [0.35, 0.8, 1.65].every((height) =>
            [-0.36, 0, 0.36].every((offset) =>
              visible(
                world,
                {
                  x: point.x + (dz ? offset : 0),
                  y: support + height,
                  z: point.z + (dx ? offset : 0),
                },
                {
                  x: end.x + (dz ? offset : 0),
                  y: support + height,
                  z: end.z + (dx ? offset : 0),
                },
              ),
            ),
          )
        )
          out.push(next);
      }
    }
    return out;
  });
  // Connect endpoints only through a clear corridor. A nearby node behind a wall
  // is not a valid attachment to the graph.
  const connects = (from: Vec3, to: Vec3) => {
    if (Math.abs(from.y - to.y) > 1.05) return false;
    const dx = to.x - from.x,
      dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    const ox = length > 0 ? (-dz / length) * 0.33 : 0;
    const oz = length > 0 ? (dx / length) * 0.33 : 0;
    const y = Math.max(from.y, to.y);
    return [0.35, 0.9, 1.65].every((height) =>
      [-1, 0, 1].every((side) =>
        visible(
          world,
          { x: from.x + ox * side, y: y + height, z: from.z + oz * side },
          { x: to.x + ox * side, y: y + height, z: to.z + oz * side },
        ),
      ),
    );
  };
  const nearest = (point: Vec3) => {
    let best = -1,
      length = 4;
    nodes.forEach((node, i) => {
      const d = distance(node, point);
      if (d < length && connects(point, node)) {
        best = i;
        length = d;
      }
    });
    return best;
  };
  const plan = (
    from: Vec3,
    to: Vec3,
    avoid?: Vec3,
  ): NavigationRoute | undefined => {
    if (!world.canOccupy(to, 1.8)) return undefined;
    const start = nearest(from),
      end = nearest(to);
    if (start < 0 || end < 0) return undefined;
    const blocked = avoid ? nearest(avoid) : -1;
    const parents = new Map<number, number>([[start, -1]]);
    const queue = [start];
    for (let i = 0; i < queue.length && !parents.has(end); i++)
      for (const neighbor of neighbors[queue[i]!]!)
        if (
          !parents.has(neighbor) &&
          (neighbor !== blocked || neighbor === start)
        ) {
          parents.set(neighbor, queue[i]!);
          queue.push(neighbor);
        }
    if (!parents.has(end)) return undefined;
    const result: Vec3[] = [];
    for (let n = end; n !== start; n = parents.get(n)!) result.push(nodes[n]!);
    result.push(nodes[start]!);
    result.reverse();
    if (distance(result[0]!, from) < 0.2) result.shift();
    if (!result.length || distance(result.at(-1)!, to) > 0.1) result.push(to);
    let length = 0,
      previous = from;
    for (const p of result) {
      length += distance(previous, p);
      previous = p;
    }
    return { waypoints: result, destination: to, length };
  };
  const positions: readonly TacticalPosition[] =
    map.tacticalPositions ??
    map.spawns.map((position, i) => ({
      id: 'patrol-' + i,
      position,
      role: 'advance' as const,
    }));
  // Supply positions describe the box, not a walkable destination. Approach from
  // a reachable neighboring floor node with line of sight to the pickup.
  const supplies = (map.supplies ?? []).map((box) => ({
    box,
    approaches: nodes.filter(
      (p) =>
        distance({ ...p, y: p.y + 1 }, box) < 2.3 &&
        visible(world, { ...p, y: p.y + 1 }, box),
    ),
  }));
  return {
    positions,
    defenseCenter: map.defense?.players[0],
    plan,
    patrol(index: number): Vec3 {
      return (
        positions[Math.abs(index) % positions.length]?.position ??
        nodes[0] ?? { x: 0, y: 0, z: 0 }
      );
    },
    supply(from: Vec3, avoid?: Vec3): Vec3 | undefined {
      let best: NavigationRoute | undefined;
      for (const { approaches } of supplies)
        for (const p of approaches) {
          if (best && distance(from, p) >= best.length) continue;
          const route = plan(from, p, avoid);
          if (route && (!best || route.length < best.length)) best = route;
        }
      return best?.destination;
    },
    path(from: Vec3, to: Vec3): Vec3[] {
      return plan(from, to)?.waypoints ?? [];
    },
  };
}
