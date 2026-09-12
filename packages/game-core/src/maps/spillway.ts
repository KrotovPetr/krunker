import type { MapBlock, MapDefinition } from './arena.js';
import { withSupplyCrates, mapLocalPoint } from './arena.js';

const blocks: MapBlock[] = [];
const concrete = 0x8f887a,
  pale = 0xb9ae98,
  dark = 0x354345,
  teal = 0x426f73,
  rust = 0x9a5734,
  rock = 0x665748;

function box(
  id: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color = concrete,
  surface: MapBlock['surface'] = 'concrete',
  yaw = 0,
) {
  const block: MapBlock = {
    id,
    shape: 'box',
    position: { x, y, z },
    size: { x: sx, y: sy, z: sz },
    yaw,
    color,
    surface,
  };
  blocks.push(block);
  return block;
}

function ramp(
  id: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  yaw: number,
) {
  blocks.push({
    id,
    shape: 'ramp',
    position: { x, y, z },
    size: { x: sx, y: sy, z: sz },
    yaw,
    color: pale,
    surface: 'concrete',
  });
}

function wallBetween(
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  y: number,
  height: number,
  thickness = 0.55,
  color = concrete,
) {
  box(
    id,
    (ax + bx) / 2,
    y,
    (az + bz) / 2,
    Math.hypot(bx - ax, bz - az),
    height,
    thickness,
    color,
    'stone',
    -Math.atan2(bz - az, bx - ax),
  );
}

// The lowest route sits at y=0. Higher concrete masses turn the rectangular
// physics floor into a three-level quarry instead of a flat arena.
box('floor', 0, -0.5, 0, 72, 1, 64, 0x858276, 'concrete');
box('west-boundary', -36.5, 5, 0, 1, 10, 66, rock);
box('east-boundary', 36.5, 5, 0, 1, 10, 66, rock);
box('north-boundary', 0, 6, -32.5, 72, 12, 1, rock);
box('south-boundary', 0, 3, 32.5, 72, 6, 1, rock);
box('north-east-rock-mass', 25, 4, -28.5, 22, 8, 8, rock);
box('west-rock-mass', -34, 3, -19, 4, 6, 22, rock);
box('east-rock-mass', 34, 3.5, -13, 5, 7, 30, rock);

// Dam and intake. The broad top is the highest playable level at y=6.
box('dam-foundation', -13, 3, -23, 42, 6, 16, concrete, 'concrete');
box('east-upper-landing', 18, 3, -24, 20, 6, 14, pale, 'paving');
box('dam-winch-west', -28, 6.7, -27, 3.5, 1.4, 3, dark, 'metal');
box('dam-headhouse-center', -16, 7.35, -27, 10, 2.7, 5.8, teal, 'metal');
box('dam-winch-east', -4, 6.7, -27, 3.5, 1.4, 3, dark, 'metal');
box('dam-back-wall', -13, 6.6, -31, 42, 1.2, 0.55, concrete);
for (const x of [-33, -25, -17, -9, -1, 7])
  ramp(`dam-buttress-${x}`, x, 3.2, -13.55, 3.5, 6.4, 1.35, Math.PI / 2);
box('dam-west-parapet', -33.4, 6.6, -22.5, 0.45, 1.2, 15, pale);
box('dam-front-parapet', -10, 6.55, -14.85, 34, 1.1, 0.35, pale);
box('upper-link-parapet', 15, 6.55, -17.15, 14, 1.1, 0.35, pale);

// Two long spillway ramps connect the dam to the quarry floor. The east ramp
// intersects the bridge halfway down, just like the concept render.
ramp('west-dam-ramp', -31, 3, -7.25, 16.5, 6, 6.5, Math.PI / 2);
ramp('east-spillway-ramp', 27, 3, -6, 22, 6, 8, Math.PI / 2);
box('west-ramp-outer-wall', -34.35, 3.2, -7.25, 0.55, 6.4, 16.5, concrete);
box('west-ramp-inner-curb', -27.65, 1.2, -6, 0.45, 2.4, 12, pale);
box('east-ramp-outer-wall', 31.25, 3.2, -14, 0.55, 6.4, 22, concrete);
box('east-ramp-inner-curb', 22.75, 3.2, -18, 0.45, 6.4, 14, pale);

// Valve station on the middle level. It is a compact building with a usable
// roof apron, rather than a single crate placed in the center.
box('valve-platform', -8, 1.5, -5, 20, 3, 15, pale, 'paving');
box('valve-control-room', -12, 4.05, -7.5, 7.5, 2.1, 3.5, concrete);
box('valve-service-core', -3.2, 3.75, -8.5, 4.2, 1.5, 3, dark, 'metal');
box('valve-back-screen', -8, 4.2, -11.9, 19, 2.4, 0.65, concrete);
box('valve-west-parapet', -17.65, 3.55, -4.5, 0.35, 1.1, 14, pale);
box('valve-east-parapet', 1.65, 3.55, -8, 0.35, 1.1, 7, pale);
box('valve-front-cover', -7, 3.75, 1.5, 3.2, 1.5, 1.6, rust, 'metal');
// Access from the bridge landing onto the valve apron, over the tunnel mouth.
box('valve-access-link', -18.5, 2.85, 2.4, 4, 0.3, 3.2, pale, 'concrete');

// The diagonal bridge is the map's main silhouette. Its eastern end meets the
// spillway ramp at y=3, while the western end rests on a hollow landing.
const bridgeYaw = 0.337;
const bridgeX = 4,
  bridgeZ = 1,
  bridgeLength = 46,
  bridgeWidth = 6;
const bridge = box(
  'bridge-deck',
  bridgeX,
  3.05,
  bridgeZ,
  bridgeLength,
  0.3,
  bridgeWidth,
  0x8a8d87,
  'metal',
  bridgeYaw,
);
for (const side of [-1, 1]) {
  const offset = side * (bridgeWidth / 2 - 0.08);
  const center = mapLocalPoint(bridge, 0, 0.35, offset);
  box(
    `bridge-curb-${side}`,
    center.x,
    center.y,
    center.z,
    bridgeLength,
    0.7,
    0.22,
    rust,
    'metal',
    bridgeYaw,
  );
}
for (const along of [-12, 12]) {
  const foot = mapLocalPoint(bridge, along, 0, -2.4);
  box(`bridge-pier-${along}`, foot.x, 1.45, foot.z, 1.1, 2.9, 1.1, concrete);
}
box(
  'bridge-sight-break',
  4.55,
  4.05,
  2.57,
  3.2,
  2,
  2.2,
  dark,
  'metal',
  bridgeYaw,
);

// The west landing is a roof over the collector entrance. The solid ramp ends
// at its western edge; the tunnel stays open below it.
box('west-landing-roof', -22, 2.75, 8, 10, 0.5, 10, pale, 'paving');
box('west-landing-north-wall', -22, 1.25, 2.75, 10, 2.5, 0.5, concrete);
box('west-landing-south-wall', -24.5, 1.25, 13.25, 5, 2.5, 0.5, concrete);
ramp('west-landing-ramp', -31, 1.5, 8, 8, 3, 6.5, 0);
box('west-landing-ramp-wall', -31, 1.2, 11.5, 8, 2.4, 0.45, concrete);

// The collector is a real, standing-height T junction. The horizontal branch
// exits west and east; the stem opens toward the turbine yard.
box('collector-main-roof', -1, 2.75, 5, 34, 0.5, 6, pale, 'paving');
box('collector-main-north', -1, 1.25, 1.75, 34, 2.5, 0.5, concrete);
box('collector-main-south-west', -10, 1.25, 8.25, 16, 2.5, 0.5, concrete);
box('collector-main-south-east', 11.5, 1.25, 8.25, 9, 2.5, 0.5, concrete);
box('collector-stem-roof', 4.5, 2.75, 13.5, 7.5, 0.5, 11, pale, 'paving');
box('collector-stem-west', 0.75, 1.25, 13.5, 0.5, 2.5, 11, concrete);
box('collector-stem-east', 8.25, 1.25, 13.5, 0.5, 2.5, 11, concrete);
box('collector-baffle-west', -5, 1.1, 4.1, 0.5, 2.2, 2.4, dark, 'metal');
box('collector-baffle-east', 9, 1.1, 6.5, 0.5, 2.2, 2.4, dark, 'metal');
box('collector-baffle-stem', 6.7, 1.1, 12, 2.2, 2.2, 0.5, dark, 'metal');

// Turbine platform. The collider reserves the machinery volume; the renderer
// supplies the wheel, shaft, canopy truss and pipework.
box('turbine-platform', 21.75, 1.5, 19, 16.5, 3, 17, pale, 'paving');
box('turbine-casing', 20, 4.7, 18, 6.5, 3.4, 5, rust, 'metal');
box('turbine-canopy', 20, 7.35, 18, 12, 0.5, 8, teal, 'metal');
for (const x of [14, 26])
  for (const z of [14.6, 21.4])
    box(`turbine-column-${x}-${z}`, x, 4.7, z, 0.65, 3.4, 0.65, dark, 'metal');
box('turbine-north-parapet', 21.75, 3.55, 10.7, 16.5, 1.1, 0.4, concrete);
box('turbine-east-parapet', 29.8, 3.55, 19, 0.4, 1.1, 17, concrete);
box('turbine-south-parapet-west', 14, 3.55, 27.3, 8, 1.1, 0.4, concrete);
box('turbine-south-parapet-east', 26, 3.55, 27.3, 8, 1.1, 0.4, concrete);
ramp('turbine-access-ramp', 11, 1.5, 24, 6, 3, 5.5, 0);
ramp('turbine-south-ramp', 20, 1.5, 29.25, 3.5, 3, 6, Math.PI / 2);
box('turbine-yard-cover', 25, 3.8, 24, 2.8, 1.6, 2.8, teal, 'metal');
box('turbine-yard-crate', 27, 3.65, 17, 2.2, 1.3, 2.2, dark, 'metal');

// Broken retaining walls shape the dry channel. Gaps stay deliberate: each
// tunnel mouth and each ramp has more than one approach.
wallBetween('channel-outer-west-a', -35, -1, -32, 15, 1.25, 2.5);
wallBetween('channel-outer-west-b', -32, 15, -24, 25, 1.25, 2.5);
wallBetween('channel-outer-south', -24, 25, -10, 29, 1.25, 2.5);
wallBetween('channel-inner-west-a', -25, -1, -26, 3, 0.8, 1.6);
wallBetween('channel-inner-west-b', -26, 14, -20, 20, 0.8, 1.6);
wallBetween('channel-inner-south', -20, 20, -8, 23, 0.8, 1.6);
wallBetween('basin-guide-west', -4, 22, 2, 25, 0.8, 1.6);
wallBetween('basin-guide-east', 31, 4, 33, 14, 1.25, 2.5);

// Medium cover keeps the open quarry from turning into one sniper lane.
box('channel-cover-west', -29, 0.75, 18, 2.8, 1.5, 2.8, teal, 'metal', 0.3);
box('channel-cover-mid', -14, 0.65, 19, 3, 1.3, 2.2, rust, 'metal', -0.25);
box('east-basin-cover', 30, 0.75, 3, 2.5, 1.5, 3.2, teal, 'metal');
box('dam-apron-cover', 14, 0.65, -10, 4, 1.3, 1.8, dark, 'metal');

export const SPILLWAY: MapDefinition = withSupplyCrates({
  id: 'spillway',
  name: 'Spillway',
  description:
    'Гидроузел в скальном котловане. Плотина, косой мост и турбинная площадка связаны двумя водосбросами и Т-образным подземным коллектором.',
  navigationHeights: [2.2, 5.2, 8.2],
  upperLevel: 2.5,
  zones: [
    { name: 'ПЛОТИНА', x: -14, z: -23, radius: 14, level: 1 },
    { name: 'КЛАПАННАЯ', x: -8, z: -5, radius: 10, level: 1 },
    { name: 'МОСТ', x: 6, z: 0, radius: 12, level: 1 },
    { name: 'ЗАПАДНЫЙ СКАТ', x: -30, z: -7, radius: 9 },
    { name: 'КОЛЛЕКТОР', x: -1, z: 7, radius: 12 },
    { name: 'СУХОЙ КАНАЛ', x: -18, z: 20, radius: 13 },
    { name: 'ТУРБИНА', x: 20, z: 19, radius: 11, level: 1 },
    { name: 'ВОСТОЧНЫЙ СКАТ', x: 29, z: -9, radius: 10 },
  ],
  supplies: [
    { x: -27, y: 6.6, z: -20 },
    { x: -18, y: 0.6, z: 5 },
  ],
  medkits: [
    { x: 18, y: 3.6, z: 24 },
    { x: -23, y: 0.6, z: 20 },
  ],
  tacticalPositions: [
    {
      id: 'dam-overwatch',
      position: { x: -26, y: 6.03, z: -18 },
      role: 'overwatch',
    },
    {
      id: 'bridge-overwatch',
      position: { x: -10, y: 3.23, z: 5.9 },
      role: 'overwatch',
    },
    {
      id: 'turbine-overwatch',
      position: { x: 17, y: 3.03, z: 13 },
      role: 'overwatch',
    },
    { id: 'valve-guard', position: { x: -10, y: 3.03, z: 0 }, role: 'guard' },
    { id: 'turbine-guard', position: { x: 18, y: 3.03, z: 23 }, role: 'guard' },
    {
      id: 'collector-west',
      position: { x: -15, y: 0.03, z: 5 },
      role: 'flank',
    },
    { id: 'collector-east', position: { x: 14, y: 0.03, z: 5 }, role: 'flank' },
    {
      id: 'collector-south',
      position: { x: 4, y: 0.03, z: 17 },
      role: 'flank',
    },
    { id: 'west-channel', position: { x: -25, y: 0.03, z: 8 }, role: 'flank' },
    { id: 'east-spillway', position: { x: 30, y: 0.03, z: 7 }, role: 'flank' },
    {
      id: 'bridge-advance',
      position: { x: 13, y: 3.23, z: -2.2 },
      role: 'advance',
    },
    {
      id: 'basin-advance',
      position: { x: -8, y: 0.03, z: 27 },
      role: 'advance',
    },
  ],
  spawns: [
    { x: -26, y: 6.03, z: -19 },
    { x: -10, y: 6.03, z: -19 },
    { x: 14, y: 6.03, z: -22 },
    { x: -30, y: 0.03, z: 1 },
    { x: -15, y: 0.03, z: 5 },
    { x: 14, y: 0.03, z: 5 },
    { x: 4, y: 0.03, z: 17 },
    { x: 22, y: 3.03, z: 24 },
    { x: -10, y: 0.03, z: 27 },
  ],
  defense: {
    concealedSpawns: true,
    players: [
      { x: 17, y: 3.03, z: 13 },
      { x: 18, y: 3.03, z: 23 },
      { x: 22, y: 3.03, z: 24 },
      { x: 27, y: 3.03, z: 24 },
    ],
    enemies: [
      { x: -26, y: 6.03, z: -19 },
      { x: -30, y: 0.03, z: 1 },
      { x: 30, y: 0.03, z: 7 },
      { x: -15, y: 0.03, z: 5 },
      { x: 4, y: 0.03, z: 17 },
      { x: -10, y: 0.03, z: 27 },
    ],
  },
  landmarks: [
    {
      text: 'SPILLWAY / INTAKE',
      position: { x: -13, y: 5.1, z: -14.46 },
      yaw: 0,
      color: 0xd39a62,
    },
    {
      text: 'VALVE STATION',
      position: { x: -12, y: 4.25, z: -5.72 },
      yaw: 0,
      color: 0x76b7b0,
    },
    {
      text: 'U1 / COLLECTOR',
      position: { x: -18.26, y: 2.76, z: 5 },
      yaw: -Math.PI / 2,
      color: 0xd39a62,
    },
    {
      text: 'TURBINE HALL',
      position: { x: 20, y: 6.45, z: 20.53 },
      yaw: 0,
      color: 0xe0804d,
    },
  ],
  blocks,
});
