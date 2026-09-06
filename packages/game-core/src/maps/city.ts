import type { MapBlock, MapDefinition } from './arena.js';
import { withSupplyCrates } from './arena.js';

const blocks: MapBlock[] = [];
function box(
  id: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: number,
  surface: MapBlock['surface'] = 'plaster',
) {
  blocks.push({
    id,
    position: { x, y, z },
    size: { x: sx, y: sy, z: sz },
    shape: 'box',
    yaw: 0,
    color,
    surface,
  });
}
const stone = 0xd7c9ae,
  trim = 0xe9dfcb,
  dark = 0x394950;
box('floor', 0, -0.5, 0, 64, 1, 56, 0x697478, 'asphalt');
// The street ends are continuous facades, with solid collision boundaries.
box('west-boundary', -32.5, 4.5, 0, 1, 9, 58, 0xb6b0a0);
box('east-boundary', 32.5, 4.5, 0, 1, 9, 58, 0xb8c4bd);
box('north-boundary', 0, 4.5, -28.5, 64, 9, 1, 0xa89a87);
box('south-boundary', 0, 4.5, 28.5, 64, 9, 1, 0xbdb3a0);
// Low curbs have matching physics and are shallow enough to walk over.
box('civic-paving', 0, 0.06, 0, 20, 0.12, 19, 0xc5c3b6, 'paving');
for (const side of [-1, 1]) {
  box(
    `sidewalk-${side}`,
    side * 24.5,
    0.06,
    0,
    7,
    0.12,
    48,
    0xb6b5a9,
    'paving',
  );
  box(
    `square-${side}`,
    0,
    0.06,
    side * 18.7,
    56,
    0.12,
    4.2,
    0xb6b5a9,
    'paving',
  );
}
// Four open entrances. Window apertures are real holes, not painted glass.
function facade(axis: 'x' | 'z', side: number, length: number) {
  const along = (
    id: string,
    u: number,
    y: number,
    width: number,
    height: number,
    color = stone,
  ) => {
    if (axis === 'z') box(id, u, y, side * 8, width, height, 0.6, color);
    else box(id, side * 9, y, u, 0.6, height, width, color);
  };
  const prefix = `civic-${axis}-${side}`;
  // Door in the middle; two broad window bays either side.
  const door = 2,
    windowInner = 3.6,
    windowOuter = length - 2;
  along(`${prefix}-lintel`, 0, 3.85, length * 2 + 0.6, 1.3);
  for (const sign of [-1, 1]) {
    along(
      `${prefix}-door-pier-${sign}`,
      (sign * (door + windowInner)) / 2,
      1.65,
      windowInner - door,
      3.3,
    );
    along(
      `${prefix}-corner-${sign}`,
      (sign * (windowOuter + length)) / 2,
      1.65,
      length - windowOuter,
      3.3,
    );
    along(
      `${prefix}-sill-${sign}`,
      (sign * (windowInner + windowOuter)) / 2,
      0.6,
      windowOuter - windowInner,
      1.2,
      trim,
    );
  }
}
facade('z', -1, 9);
facade('z', 1, 9);
facade('x', -1, 8);
facade('x', 1, 8);
// Roof ring and open skylight over the central atrium.
box('civic-roof-west', -6.15, 4.65, 0, 6.3, 0.3, 16.6, trim, 'paving');
box('civic-roof-east', 6.15, 4.65, 0, 6.3, 0.3, 16.6, trim, 'paving');
box('civic-roof-north', 0, 4.65, -5.65, 6, 0.3, 5.3, trim, 'paving');
box('civic-roof-south', 0, 4.65, 5.65, 6, 0.3, 5.3, trim, 'paving');
for (const side of [-1, 1]) {
  box(`parapet-front-${side}`, 0, 5.15, side * 8.2, 18.8, 0.7, 0.35, stone);
  box(
    `parapet-side-${side}`,
    side * 9.2,
    5.15,
    side * 1.5,
    0.35,
    0.7,
    13.4,
    stone,
  );
  box(
    `atrium-planter-${side}`,
    side * 4.5,
    0.55,
    side * 3.8,
    2.4,
    0.85,
    1.2,
    0x817c6d,
    'stone',
  );
  box(
    `hall-column-${side}-a`,
    side * 6.8,
    2.3,
    -3.2,
    0.65,
    4.4,
    0.65,
    trim,
    'stone',
  );
  box(
    `hall-column-${side}-b`,
    side * 6.8,
    2.3,
    3.2,
    0.65,
    4.4,
    0.65,
    trim,
    'stone',
  );
}
box('reception', 0, 0.65, -4.2, 4, 1.1, 1.1, 0x658e86, 'metal');
// External stair and a bridge onto the roof. Every step is a collision solid.
for (let i = 0; i < 20; i++)
  box(
    `civic-step-${i}`,
    11.5,
    (i + 1) * 0.12,
    5.7 - i * 0.6,
    2.8,
    (i + 1) * 0.24,
    0.6,
    0xb4b2a5,
    'stone',
  );
box('roof-landing', 10.6, 4.65, -6.75, 4.6, 0.3, 1.5, trim, 'paving');
box('stair-backstop', 11.7, 2.7, -7.95, 3, 5.4, 0.35, 0xa7b4b0);
// A second roof approach prevents one stair from deciding every roof fight.
for (let i = 0; i < 20; i++)
  box(
    `west-step-${i}`,
    -11.5,
    (i + 1) * 0.12,
    -5.7 + i * 0.6,
    2.8,
    (i + 1) * 0.24,
    0.6,
    0xb4b2a5,
    'stone',
  );
box('west-roof-landing', -10.6, 4.65, 6.75, 4.6, 0.3, 1.5, trim, 'paving');
box('west-stair-backstop', -11.7, 2.7, 7.95, 3, 5.4, 0.35, 0xa7b4b0);
// Side corridors have exits at both ends; the central axis stays traversable.
for (const side of [-1, 1]) {
  box(`hall-partition-${side}`, side * 3.6, 1.6, 0, 0.4, 2.9, 3.8, 0x9caca4);
  box(
    `hall-partition-trim-${side}`,
    side * 3.6,
    3.08,
    0,
    0.5,
    0.16,
    3.9,
    trim,
    'stone',
  );
  box(`roof-vent-${side}`, side * 5.5, 5.4, 0, 2.1, 1.2, 2.3, dark, 'metal');
}
// A service wall splits the broad eastern street into two connected lanes.
box('service-yard-wall', 18.5, 1.1, -3, 0.5, 2.2, 5, 0x8b9e92, 'stone');
// Perimeter buildings form identifiable streets instead of freestanding cover cubes.
for (const [id, x, z, width, depth, height, color] of [
  ['cafe', -24, 13, 7, 11, 9, 0xd7b58c],
  ['books', -24, -13, 7, 11, 11, 0xbdc7b8],
  ['hotel', 24, 13, 7, 11, 12, 0xb8c4c1],
  ['atelier', 24, -13, 7, 11, 9.5, 0xcfb095],
  ['north-west', -12, -22, 15, 4, 10.5, 0xc9ba9e],
  ['north-east', 12, -22, 15, 4, 12, 0xa8bab5],
  ['south-west', -12, 22, 15, 4, 8.5, 0xb8c8c0],
  ['south-east', 12, 22, 15, 4, 10, 0xd3b293],
] as const) {
  box(`house-${id}`, x, height / 2, z, width, height, depth, color);
  box(
    `cornice-${id}`,
    x,
    height - 0.1,
    z,
    width + 0.3,
    0.25,
    depth + 0.3,
    trim,
    'stone',
  );
  box(`roof-${id}`, x, height + 0.2, z, width, 0.3, depth, 0x716c66, 'roof');
}
box('kiosk', -15.7, 1.55, -1, 3.6, 3.1, 4.2, 0x5b827c, 'metal');
box('kiosk-canopy', -15.7, 3.18, -1, 4.2, 0.2, 5, dark, 'metal');
for (const [i, x, z] of [
  [0, -15, 10.5],
  [1, 16, -12],
  [2, 4.8, 15],
  [3, -5.5, -15],
] as const)
  box(`street-planter-${i}`, x, 0.52, z, 3.2, 1.04, 1.8, 0xa39f8d, 'stone');
box('van-body', 17.5, 0.85, 3.8, 2.4, 1.4, 5.2, 0xaac0b4, 'metal');
box('van-cabin', 17.5, 1.9, 3.1, 2.3, 0.9, 3.7, 0xaac0b4, 'metal');
box('fountain-base', -7.8, 0.25, 14.4, 3.4, 0.5, 3.4, 0xb3b3a2, 'stone');
box('fountain-bowl', -7.8, 0.75, 14.4, 2.2, 0.5, 2.2, 0xd6ccaf, 'stone');

// Rear streets connect both stair exits around the perimeter buildings.
for (const side of [-1, 1]) {
  box(
    `alley-cover-${side}`,
    side * 29.8,
    0.65,
    side * 3,
    2,
    1.3,
    3.2,
    0x849d93,
    'stone',
  );
  box(
    `roof-shelter-${side}`,
    side * 4.7,
    5.75,
    side * 3.5,
    0.4,
    1.9,
    2.5,
    dark,
    'metal',
  );
}

export const CITY: MapDefinition = withSupplyCrates({
  id: 'bastion',
  description:
    'Площадь с фонтаном, кафе и служебный двор. Атриум связан с боковыми коридорами, на крышу ведут две лестницы с противоположных сторон.',
  navigationHeights: [3.9, 6.5],
  upperLevel: 3.9,
  zones: [
    { name: 'ЗАДНЯЯ УЛИЦА', x: -30, z: 0, radius: 10 },
    { name: 'ПЕРЕУЛОК', x: 30, z: 0, radius: 10 },
    { name: 'АТРИУМ', x: 0, z: 0, radius: 10, level: 0 },
    { name: 'КРЫША', x: 0, z: 0, radius: 14, level: 1 },
    { name: 'КАФЕ', x: -19, z: 12, radius: 9 },
    { name: 'ДВОР', x: 19, z: -10, radius: 11 },
    { name: 'ПЛОЩАДЬ', x: 0, z: 16, radius: 13 },
    { name: 'АРХИВ', x: 0, z: -16, radius: 13 },
  ],
  defense: {
    players: [
      { x: 0, y: 0.16, z: 1 },
      { x: -2, y: 0.16, z: 1 },
      { x: 2, y: 0.16, z: 1 },
      { x: 0, y: 0.16, z: -1 },
    ],
    enemies: [
      { x: -17.5, y: 0.03, z: -16 },
      { x: 17.5, y: 0.03, z: -16 },
      { x: -17.5, y: 0.03, z: 16 },
      { x: 17.5, y: 0.03, z: 16 },
      { x: 0, y: 0.16, z: -18 },
      { x: 0, y: 0.16, z: 18 },
    ],
  },
  name: 'Bastion',
  supplies: [
    { x: -2, y: 0.65, z: 3 },
    { x: -29.5, y: 0.65, z: -4 },
    { x: 29.5, y: 0.65, z: 4 },
    { x: 0, y: 5.3, z: 5.8 },
  ],
  blocks,
  landmarks: [
    {
      text: 'BASTION / CIVIC HALL',
      position: { x: 0, y: 3.85, z: 8.32 },
      yaw: 0,
      color: 0xe1b26b,
    },
    {
      text: 'ARCHIVES',
      position: { x: 0, y: 3.85, z: -8.32 },
      yaw: Math.PI,
      color: 0x97c5b5,
    },
    {
      text: 'CAFE / LUMIERE',
      position: { x: -20.48, y: 2.9, z: 13 },
      yaw: Math.PI / 2,
      color: 0xe6bb82,
    },
    {
      text: 'ATELIER / 08',
      position: { x: 20.48, y: 2.9, z: -13 },
      yaw: -Math.PI / 2,
      color: 0x99c8bc,
    },
    {
      text: 'ROOFTOP',
      position: { x: 11.7, y: 5, z: -7.765 },
      yaw: 0,
      color: 0xe1b26b,
    },
    {
      text: 'ROOFTOP',
      position: { x: -11.7, y: 5, z: 7.765 },
      yaw: Math.PI,
      color: 0x97c5b5,
    },
    {
      text: 'SERVICE / EAST',
      position: { x: 18.21, y: 1.7, z: -3 },
      yaw: -Math.PI / 2,
      color: 0x97c5b5,
    },
  ],
  spawns: [
    { x: 0, y: 0.16, z: 15 },
    { x: 0, y: 0.03, z: -15 },
    { x: -17.5, y: 0.03, z: 5 },
    { x: 17.5, y: 0.03, z: -5 },
    { x: -16, y: 0.03, z: -16 },
    { x: 16, y: 0.03, z: 16 },
    { x: -5.5, y: 4.83, z: 5.5 },
    { x: 5.5, y: 4.83, z: -5.5 },
  ],
});
