import type { MapBlock, MapDefinition } from './arena.js';
import { withSupplyCrates } from './arena.js';

const blocks: MapBlock[] = [];
const sand = 0xcdb185,
  trim = 0xe8d7b1,
  blue = 0x53818a;
function box(
  id: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color = sand,
  surface: MapBlock['surface'] = 'plaster',
) {
  blocks.push({
    id,
    shape: 'box',
    position: { x, y, z },
    size: { x: sx, y: sy, z: sz },
    color,
    surface,
    yaw: 0,
  });
}
box('floor', 0, -0.5, 0, 64, 1, 56, 0xbda984, 'paving');
box('west-boundary', -32.5, 4, 0, 1, 8, 58);
box('east-boundary', 32.5, 4, 0, 1, 8, 58);
box('north-boundary', 0, 4, -28.5, 64, 8, 1);
box('south-boundary', 0, 4, 28.5, 64, 8, 1);
// Three connected routes: west tunnels, middle doors/catwalk, east long.
box('house-market', -10, 3.2, 7, 4, 6.4, 18);
box('house-b-store', -10, 3.7, -14.5, 4, 7.4, 7, 0xb89c76);
box('house-long', 12, 3.5, 1, 7, 7, 24);
box('house-spawn', 0, 3.6, 23, 12, 7.2, 2, 0xbb9d7d);
// Walkable tunnel interior, a roof and real openings at both ends.
box('tunnel-roof', -20, 3.6, 6, 16, 0.4, 16, 0xa89071, 'stone');
box('b-entry-west', -25, 1.7, -8, 6, 3.4, 0.8);
box('b-entry-east', -15, 1.7, -8, 6, 3.4, 0.8);
box('b-entry-lintel', -20, 3.75, -8, 16, 0.7, 1, trim, 'stone');
box('tunnel-turn-cover', -24, 0.8, 5, 3, 1.6, 3, blue, 'metal');
// Mid is staggered so opposite spawn plazas have no uninterrupted firing line.
box('mid-wall-west', -6, 2, -7, 8, 4, 0.8);
box('mid-wall-east-inner', 3.1, 2, -7, 2.2, 4, 0.8);
box('mid-wall-east-outer', 9, 2, -7, 2, 4, 0.8);
box('short-lintel', 6.1, 3.9, -7, 3.8, 0.8, 1, trim, 'stone');
box('mid-lintel', 0, 3.9, -7, 4.4, 0.8, 1, trim, 'stone');
box('mid-door-left', -1.7, 1.45, -6.5, 0.6, 2.9, 0.3, 0x6e6556, 'metal');
box('mid-door-right', 1.7, 1.45, -7.5, 0.6, 2.9, 0.3, 0x6e6556, 'metal');
box('mid-sight-break', -0.8, 1.05, 1, 2.5, 2.1, 3, sand, 'stone');
box('catwalk', 6, 0.4, 0, 3, 0.8, 14, trim, 'stone');
for (let i = 0; i < 4; i++)
  box(
    `catwalk-step-${i}`,
    6,
    (i + 1) * 0.1,
    9.1 - i * 0.6,
    3,
    (i + 1) * 0.2,
    0.6,
    trim,
    'stone',
  );
// A and B have different cover silhouettes and at least two approaches.
box('site-a-floor', 20, 0.04, -17, 13, 0.08, 12, 0xd0b587, 'paving');
box('site-b-floor', -20, 0.04, -17, 13, 0.08, 12, 0xaebbaf, 'paving');
box('a-crate-low', 22, 0.6, -16, 3.5, 1.2, 2.5, 0x997753, 'metal');
box('a-crate-tall', 19.5, 1.2, -20, 2.5, 2.4, 2.5, 0x997753, 'metal');
box('b-crate-tall', -24, 1.2, -17, 2.5, 2.4, 3, blue, 'metal');
box('b-crate-low', -17, 0.6, -20, 3.5, 1.2, 2, blue, 'metal');
box('long-cover', 24, 0.7, 4, 3, 1.4, 3, 0xa99b82, 'stone');
box('spawn-cart', -5, 0.7, 17, 3, 1.4, 2, blue, 'metal');
// Flush trim and supporting piers share collision geometry with the render.
for (const side of [-1, 1]) {
  box(
    `long-gate-${side}`,
    21 + side * 3.5,
    2.1,
    11,
    1,
    4.2,
    1.2,
    trim,
    'stone',
  );
  box(
    `tunnel-entrance-${side}`,
    -20 + side * 6.9,
    1.7,
    14,
    0.8,
    3.4,
    1,
    trim,
    'stone',
  );
}
box('long-gate-lintel', 21, 4.2, 11, 8, 0.6, 1.2, trim, 'stone');
for (const building of blocks.filter((b) => b.id.startsWith('house-'))) {
  const p = building.position,
    s = building.size;
  box(
    `cornice-${building.id}`,
    p.x,
    s.y - 0.1,
    p.z,
    s.x + 0.2,
    0.22,
    s.z + 0.2,
    trim,
    'stone',
  );
  box(
    `roof-${building.id}`,
    p.x,
    s.y + 0.1,
    p.z,
    s.x,
    0.2,
    s.z,
    0xb7a18a,
    'roof',
  );
}

// Two exposed lookout terraces: long sightlines, rear and side drop-off exits.
for (const side of [-1, 1]) {
  box(`lookout-${side}`, side * 29.8, 0.6, -17, 3.2, 1.2, 6, trim, 'stone');
  box(
    `lookout-cover-${side}`,
    side * 29.3,
    1.55,
    -14,
    1.4,
    0.7,
    0.3,
    sand,
    'stone',
  );
  for (let i = 0; i < 6; i++)
    box(
      `lookout-step-${side}-${i}`,
      side * 29.8,
      (i + 1) * 0.1,
      -10.7 - i * 0.6,
      3.2,
      (i + 1) * 0.2,
      0.6,
      trim,
      'stone',
    );
  box(
    `rear-street-cover-${side}`,
    side * 13,
    0.65,
    -25.8,
    3,
    1.3,
    1.6,
    blue,
    'metal',
  );
}

for (const side of [-1, 1])
  for (let i = 0; i < 6; i++)
    box(
      'lookout-rear-step-' + side + '-' + i,
      side * 29.8,
      (i + 1) * 0.1,
      -23.3 + i * 0.6,
      3.2,
      (i + 1) * 0.2,
      0.6,
      trim,
      'stone',
    );

export const SANDGATE: MapDefinition = withSupplyCrates({
  id: 'sandgate',
  name: 'Sandgate',
  description:
    'Пустынный квартал: длинная улица к A, крытые тоннели к B, двойные двери в центре и короткий путь по галерее. Две площадки для боя и обороны.',
  navigationHeights: [2.5, 4.9],
  upperLevel: 0.65,
  zones: [
    { name: 'ОБХОД', x: 0, z: -26, radius: 9 },
    { name: 'A', x: 20, z: -17, radius: 9 },
    { name: 'B', x: -20, z: -17, radius: 9 },
    { name: 'ТОННЕЛИ', x: -20, z: 5, radius: 12 },
    { name: 'ДЛИННАЯ', x: 22, z: 6, radius: 13 },
    { name: 'ЦЕНТР', x: 0, z: -2, radius: 12 },
    { name: 'ПЛОЩАДЬ', x: 0, z: 18, radius: 20 },
  ],
  supplies: [
    { x: 3, y: 0.6, z: 20 },
    { x: -15, y: 0.6, z: -23 },
    { x: 16, y: 0.6, z: -23 },
  ],
  blocks,
  spawns: [
    { x: 0, y: 0.03, z: 18 },
    { x: -20, y: 0.12, z: -21 },
    { x: 23, y: 0.12, z: -21 },
    { x: 0, y: 0.03, z: -18 },
    { x: -20, y: 0.03, z: 10 },
    { x: 21, y: 0.03, z: 14 },
    { x: -5, y: 0.03, z: 7 },
    { x: 6, y: 0.83, z: 0 },
  ],
  defense: {
    players: [
      { x: 0, y: 0.03, z: 18 },
      { x: 2, y: 0.03, z: 18 },
      { x: -2, y: 0.03, z: 18 },
      { x: 0, y: 0.03, z: 20 },
    ],
    enemies: [
      { x: -20, y: 0.12, z: -21 },
      { x: 23, y: 0.12, z: -21 },
      { x: 0, y: 0.03, z: -20 },
      { x: -26, y: 0.03, z: 0 },
      { x: 26, y: 0.03, z: -6 },
    ],
  },
  landmarks: [
    {
      text: 'A / SHORT',
      position: { x: 6.1, y: 3.9, z: -6.48 },
      yaw: 0,
      color: 0xffc178,
    },
    {
      text: 'A / LONG STREET',
      position: { x: 21, y: 4.2, z: 11.62 },
      yaw: 0,
      color: 0xffc178,
    },
    {
      text: 'B / TUNNELS',
      position: { x: -20, y: 3.6, z: 14.22 },
      yaw: 0,
      color: 0x9ad9d7,
    },
    {
      text: 'MID / DOUBLE DOORS',
      position: { x: 0, y: 3.9, z: -6.48 },
      yaw: 0,
      color: 0xe7d4ae,
    },
    {
      text: 'A / COURTYARD',
      position: { x: 20, y: 4.15, z: -27.85 },
      yaw: 0,
      color: 0xffc178,
    },
    {
      text: 'B / COURTYARD',
      position: { x: -20, y: 4.15, z: -27.85 },
      yaw: 0,
      color: 0x9ad9d7,
    },
  ],
});
