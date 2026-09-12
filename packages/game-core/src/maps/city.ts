import type { MapBlock, MapDefinition } from './arena.js';
import { withSupplyCrates } from './arena.js';

const blocks: MapBlock[] = [];
const stone = 0xbca98b,
  trim = 0xe3d4b8,
  brick = 0xb07b5c,
  teal = 0x638b87,
  dark = 0x354950;
function box(
  id: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color = stone,
  surface: MapBlock['surface'] = 'plaster',
) {
  blocks.push({
    id,
    shape: 'box',
    position: { x, y, z },
    size: { x: sx, y: sy, z: sz },
    yaw: 0,
    color,
    surface,
  });
}
box('floor', 0, -0.5, 0, 64, 1, 56, 0x697478, 'asphalt');
box('west-boundary', -32.5, 5, 0, 1, 10, 58);
box('east-boundary', 32.5, 5, 0, 1, 10, 58, 0x9caaa1);
box('north-boundary', 0, 5, -28.5, 64, 10, 1);
box('south-boundary', 0, 5, 28.5, 64, 10, 1, 0x9caaa1);

// Two offset, walk-through buildings replace the central atrium and four pockets.
// Each wall's doorway is built from two jambs plus a lintel, never painted on.
function doorway(
  id: string,
  axis: 'x' | 'z',
  fixed: number,
  start: number,
  end: number,
  opening: number,
  width: number,
  color: number,
) {
  const piece = (
    suffix: string,
    a: number,
    b: number,
    y: number,
    h: number,
  ) => {
    if (axis === 'z')
      box(id + suffix, (a + b) / 2, y, fixed, b - a, h, 0.6, color);
    else box(id + suffix, fixed, y, (a + b) / 2, 0.6, h, b - a, color);
  };
  piece('-jamb-a', start, opening - width / 2, 1.85, 3.7);
  piece('-jamb-b', opening + width / 2, end, 1.85, 3.7);
  piece('-lintel', opening - width / 2, opening + width / 2, 3.5, 0.4);
}
box('depot-floor', -19, 0.06, -6, 18, 0.12, 18, 0xc4b9a1, 'paving');
box('depot-west-wall', -28, 1.85, -6, 0.6, 3.7, 18, brick);
doorway('depot-north', 'z', -15, -28, -10, -19, 5, brick);
doorway('depot-south', 'z', 3, -28, -10, -19, 5, brick);
doorway('depot-east', 'x', -10, -15, 3, -7, 5, brick);
box('depot-roof', -19, 3.85, -6, 18.6, 0.3, 18.6, trim, 'paving');
box('house-depot-office', -23, 6.1, -10.5, 8, 4.2, 6, brick);
box('depot-office-cap', -23, 8.3, -10.5, 8.5, 0.2, 6.5, dark, 'roof');
box('depot-counter', -24, 0.75, -2, 4, 1.3, 1.5, teal, 'metal');
box('depot-sorter', -14, 1.2, -11, 3, 2.4, 2, dark, 'metal');
// This wing reaches the boundary, so the back lane cannot become an outer ring.
box('house-depot-wing', -30, 3.7, -11, 4, 7.4, 8, brick);

box('station-floor', 18, 0.06, 3, 16, 0.12, 20, 0xb5beb3, 'paving');
doorway('station-north', 'z', -7, 10, 26, 18, 5, teal);
doorway('station-south', 'z', 13, 10, 26, 18, 5, teal);
doorway('station-west', 'x', 10, -7, 13, 4, 5, teal);
box('station-east-wall', 26, 1.85, 3, 0.6, 3.7, 20, teal);
box('station-roof', 18, 3.85, 3, 16.6, 0.3, 20.6, trim, 'paving');
box('house-station-office', 21, 5.85, 7, 8, 3.7, 7, teal);
box('station-office-cap', 21, 7.8, 7, 8.5, 0.2, 7.5, dark, 'roof');
box('station-counter', 22.5, 0.75, 0, 4, 1.3, 1.6, brick, 'metal');
box('station-lockers', 13, 1.2, 9, 2, 2.4, 3, dark, 'metal');
box('house-station-wing', 29, 3.7, 8, 6, 7.4, 8, teal);

// A straight gallery connects both terraces at +4 m. Street traffic crosses below.
box('gallery-deck', 0, 3.85, -5, 20, 0.3, 4, dark, 'metal');
for (const side of [-1, 1]) {
  box(
    'gallery-curb-' + side,
    0,
    4.3,
    -5 + side * 1.85,
    20,
    0.6,
    0.3,
    trim,
    'stone',
  );
  box(
    'gallery-column-' + side,
    side * 6,
    1.85,
    -6.6,
    0.7,
    3.7,
    0.7,
    stone,
    'stone',
  );
}
box('gallery-screen', 0, 4.85, -3.4, 3.2, 1.7, 0.3, teal, 'metal');
// Terrace rails leave the gallery and both stair landings open.
box('depot-front-parapet', -20, 4.55, 3.2, 16, 1.1, 0.35);
box('depot-north-parapet', -19, 4.55, -15.2, 18.6, 1.1, 0.35);
box('depot-west-parapet', -28.2, 4.55, -6, 0.35, 1.1, 18.6);
box('depot-east-rail-north', -9.8, 4.55, -11.4, 0.35, 1.1, 7.2);
box('depot-east-rail-south', -9.8, 4.55, 2, 0.35, 1.1, 2);
box('station-south-parapet', 18, 4.55, 13.2, 16.6, 1.1, 0.35);
box('station-north-parapet', 18, 4.55, -7.2, 16.6, 1.1, 0.35);
box('station-east-rail', 26.2, 4.55, 5, 0.35, 1.1, 16);
box('station-west-rail', 9.8, 4.55, 5.1, 0.35, 1.1, 16.2);
box('depot-roof-cover', -15, 4.75, -2.5, 2.4, 1.5, 1.4, dark, 'metal');
box('station-roof-cover', 14, 4.75, 3, 2, 1.5, 1.4, dark, 'metal');

for (let i = 0; i < 16; i++) {
  box(
    'depot-step-' + i,
    -7,
    (i + 1) * 0.125,
    10 - i * 0.65,
    3.4,
    (i + 1) * 0.25,
    0.65,
    trim,
    'stone',
  );
  box(
    'station-step-' + i,
    28.5,
    (i + 1) * 0.125,
    -16 + i * 0.65,
    3.4,
    (i + 1) * 0.25,
    0.65,
    trim,
    'stone',
  );
}
box('depot-landing', -9, 3.85, -0.6, 7.4, 0.3, 2.4, trim, 'paving');
box('depot-stair-stop', -7, 2.25, -1.95, 3.4, 4.5, 0.3);
box('station-landing', 27, 3.85, -5.4, 6.4, 0.3, 2, trim, 'paving');
box('station-stair-stop', 28.5, 2.25, -4.25, 3.4, 4.5, 0.3);

// The tram street bends around solid cover. North and south are different spaces.
box('tram-paving', -2, 0.06, 10, 8, 0.12, 24, 0xb6b5a9, 'paving');
box('tram-body', -3, 0.85, 9, 3.6, 1.45, 10, 0xa75e41, 'metal');
box('tram-cabin', -3, 2.15, 9, 3.5, 1.2, 9.7, 0xb87752, 'metal');
box('tram-roof', -3, 2.87, 9, 3.9, 0.24, 10.3, trim, 'roof');
box('tram-stop-counter', 6, 0.65, 16, 3.5, 1.3, 1.6, teal, 'metal');
box('tram-stop-canopy', 6, 3.15, 16, 4.5, 0.2, 2.6, teal, 'metal');
for (const x of [4.2, 7.8])
  box('tram-stop-post-' + x, x, 1.6, 16.9, 0.16, 3, 0.16, dark, 'metal');
box('square-monument-base', 0, 0.4, -17, 5, 0.8, 4, trim, 'stone');
box('square-monument', 0, 2.1, -17, 1.8, 3, 1.8, brick, 'stone');
box('square-planter', 5, 0.6, -11, 3.8, 1.2, 1.8, stone, 'stone');
box('market-counter', -13, 0.65, 17, 4, 1.3, 2, teal, 'metal');
box('market-awning', -13, 3.15, 17, 4.8, 0.2, 3, 0xbd8155, 'metal');
for (const x of [-15, -11])
  box('market-post-' + x, x, 1.6, 18.2, 0.18, 3, 0.18, dark, 'metal');
// Unequal perimeter fronts cut sightlines and feed the two buildings, not four pockets.
for (const [id, x, z, sx, sz, height, color] of [
  ['north-west', -13, -24, 13, 8, 9, brick],
  ['north-east', 15, -24, 12, 8, 11, teal],
  ['south-west', -23, 24, 18, 8, 8, 0xc9b99a],
  ['south-east', 23, 25, 18, 6, 10, 0x9caaa1],
] as const) {
  box('house-' + id, x, height / 2, z, sx, height, sz, color);
  box('cap-' + id, x, height + 0.1, z, sx + 0.2, 0.2, sz + 0.2, trim, 'roof');
}
box('west-delivery-cover', -29, 1.3, 15, 3.5, 2.6, 3, dark, 'metal');
box('east-delivery-cover', 29, 1.3, 19, 3.5, 2.6, 2.5, teal, 'metal');

export const CITY: MapDefinition = withSupplyCrates({
  id: 'bastion',
  control: {
    position: { x: 0, y: 0.03, z: -5 },
    radius: 4,
    allies: [
      { x: -4, y: 0.16, z: 20 },
      { x: -2, y: 0.16, z: 20 },
      { x: -4, y: 0.16, z: 22 },
      { x: -2, y: 0.16, z: 22 },
      { x: -4, y: 0.03, z: 24 },
      { x: -2, y: 0.03, z: 24 },
      { x: -6, y: 0.16, z: 22 },
    ],
    enemies: [
      { x: 1, y: 0.03, z: -24 },
      { x: -1, y: 0.03, z: -24 },
      { x: 1, y: 0.03, z: -26 },
      { x: -1, y: 0.03, z: -26 },
      { x: 0, y: 0.03, z: -27 },
    ],
  },
  name: 'Bastion',
  description:
    'Трамвайный квартал: проходное депо, станция и галерея между террасами. Два независимых подъёма, улица под мостом и торговый ряд вместо центрального атриума.',
  navigationHeights: [2.8, 3.9, 5.9],
  upperLevel: 3.5,
  blocks,
  zones: [
    { name: 'ГАЛЕРЕЯ', x: 0, z: -5, radius: 10, level: 1 },
    { name: 'ТЕРРАСА ДЕПО', x: -19, z: -6, radius: 14, level: 1 },
    { name: 'ТЕРРАСА СТАНЦИИ', x: 18, z: 3, radius: 14, level: 1 },
    { name: 'ДЕПО', x: -19, z: -6, radius: 12, level: 0 },
    { name: 'СТАНЦИЯ', x: 18, z: 3, radius: 12, level: 0 },
    { name: 'ТРАМВАЙНАЯ УЛИЦА', x: -2, z: 10, radius: 12 },
    { name: 'ПЛОЩАДЬ', x: 0, z: -18, radius: 14 },
    { name: 'ТОРГОВЫЙ РЯД', x: -17, z: 17, radius: 10 },
    { name: 'ПОД ГАЛЕРЕЕЙ', x: 0, z: -5, radius: 8, level: 0 },
  ],
  spawns: [
    { x: 0, y: 0.16, z: 22 },
    { x: 5, y: 0.03, z: -24 },
    { x: -19, y: 0.16, z: -5 },
    { x: 18, y: 0.16, z: 6 },
    { x: -25, y: 0.03, z: -22 },
    { x: 27, y: 0.03, z: 21 },
    { x: -16, y: 4.03, z: 0 },
    { x: 13, y: 4.03, z: 6 },
  ],
  defense: {
    concealedSpawns: true,
    players: [
      { x: -22, y: 0.16, z: -5 },
      { x: -20, y: 0.16, z: -5 },
      { x: -22, y: 0.16, z: -7 },
      { x: -20, y: 0.16, z: -7 },
    ],
    enemies: [
      { x: -25, y: 0.03, z: -23 },
      { x: 25, y: 0.03, z: -23 },
      { x: 28, y: 0.03, z: 21 },
      { x: -29, y: 0.03, z: 18 },
    ],
  },
  tacticalPositions: [
    { id: 'depot', position: { x: -19, y: 0.16, z: -5 }, role: 'guard' },
    { id: 'depot-east', position: { x: -13, y: 0.16, z: -7 }, role: 'advance' },
    { id: 'station', position: { x: 18, y: 0.16, z: 4 }, role: 'guard' },
    { id: 'under-gallery', position: { x: 0, y: 0.03, z: -5 }, role: 'flank' },
    { id: 'market', position: { x: -18, y: 0.03, z: 15 }, role: 'flank' },
    { id: 'tram', position: { x: 2, y: 0.16, z: 10 }, role: 'advance' },
    { id: 'square', position: { x: 5, y: 0.03, z: -18 }, role: 'guard' },
    {
      id: 'depot-terrace',
      position: { x: -14, y: 4.03, z: 0 },
      role: 'overwatch',
    },
    {
      id: 'station-terrace',
      position: { x: 13, y: 4.03, z: 6 },
      role: 'overwatch',
    },
    { id: 'gallery', position: { x: 0, y: 4.03, z: -5 }, role: 'advance' },
  ],
  supplies: [
    { x: -25, y: 0.65, z: 0 },
    { x: 23, y: 0.65, z: 10 },
  ],
  medkits: [
    { x: 4, y: 0.65, z: -23 },
    { x: -17, y: 4.6, z: -3 },
  ],
  landmarks: [
    {
      text: 'BASTION / DEPOT',
      position: { x: -19, y: 3.45, z: 3.32 },
      yaw: 0,
      color: 0xf1bc87,
    },
    {
      text: 'STATION / 02',
      position: { x: 18, y: 3.45, z: 13.32 },
      yaw: 0,
      color: 0x9cd9cb,
    },
    {
      text: 'GALLERY',
      position: { x: 0, y: 4.8, z: -3.22 },
      yaw: 0,
      color: 0xf1bc87,
    },
    {
      text: 'MARKET',
      position: { x: -13, y: 2.7, z: 18.52 },
      yaw: 0,
      color: 0xf1bc87,
    },
  ],
});
