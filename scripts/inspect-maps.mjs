import {
  ARENA,
  CITY,
  SANDGATE,
  createCollisionWorld,
  initializePhysics,
} from '../packages/game-core/dist/index.js';
import {
  createNavigation,
  visible,
} from '../packages/game-core/dist/bots/brain.js';

// Read-only geometry measurements. Run after pnpm build:packages.
// A sightline is a single standing-eye ray, not proof of spawn safety or balance.
await initializePhysics();
const eye = (point) => ({ ...point, y: point.y + 1.65 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const results = [];
for (const map of [ARENA, CITY, SANDGATE]) {
  const world = createCollisionWorld(map);
  try {
    const navigation = createNavigation(map, world);
    const spawnSightlines = [];
    for (let i = 0; i < map.spawns.length; i++)
      for (let j = i + 1; j < map.spawns.length; j++)
        if (visible(world, eye(map.spawns[i]), eye(map.spawns[j])))
          spawnSightlines.push({
            indices: [i, j],
            meters: Number(distance(map.spawns[i], map.spawns[j]).toFixed(1)),
          });
    const observations = [
      { name: 'defender-start', position: map.defense.players[0] },
      ...(map.id === 'sandgate'
        ? [
            { name: 'east-terrace', position: { x: 30.8, y: 1.23, z: -17 } },
            { name: 'west-terrace', position: { x: -30.8, y: 1.23, z: -17 } },
          ]
        : []),
    ].map(({ name, position }) => ({
      name,
      position,
      visibleGateIndices: map.defense.enemies.flatMap((point, i) =>
        visible(world, eye(position), eye(point)) ? [i] : [],
      ),
    }));
    const endpoints =
      map.id === 'sandgate'
        ? [
            [map.spawns[1], map.spawns[2]],
            [
              { x: -29, y: 0.03, z: -25 },
              { x: 29, y: 0.03, z: -25 },
            ],
          ]
        : map.id === 'bastion'
          ? [
              [
                { x: 30, y: 0.03, z: -20 },
                { x: 30, y: 0.03, z: 20 },
              ],
            ]
          : [];
    const routes = endpoints.map(([from, to]) => {
      const path = navigation.path(from, to);
      // [] may also mean both endpoints map to the same graph node.
      if (!path.length) return { from, to, status: 'no-distinct-node-path' };
      const points = [from, ...path, to];
      const meters = points
        .slice(1)
        .reduce((sum, p, i) => sum + distance(points[i], p), 0);
      return {
        from,
        to,
        graphPathMeters: Number(meters.toFixed(1)),
        secondsAtConstant8_5MetersPerSecond: Number((meters / 8.5).toFixed(1)),
      };
    });
    results.push({ map: map.id, spawnSightlines, observations, routes });
  } finally {
    world.dispose();
  }
}
console.log(JSON.stringify(results, null, 2));
