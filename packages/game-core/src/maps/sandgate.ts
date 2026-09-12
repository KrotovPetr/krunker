import type { MapBlock, MapDefinition } from './arena.js';
import { withSupplyCrates } from './arena.js';
const blocks: MapBlock[] = [];
const sand = 0xc8aa80,
  trim = 0xe7d7b5,
  teal = 0x4b8382,
  clay = 0xb9724c;
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
    yaw: 0,
    color,
    surface,
  });
}
box('floor', 0, -0.5, 0, 64, 1, 56, 0xb7a789, 'paving');
box('west-boundary', -32.5, 4, 0, 1, 8, 58);
box('east-boundary', 32.5, 4, 0, 1, 8, 58);
box('north-boundary', 0, 4, -28.5, 64, 8, 1);
box('south-boundary', 0, 4, 28.5, 64, 8, 1);
// Offset buildings touch the perimeter: no uninterrupted outside ring.
box('house-market-wing', -29, 3.2, -3, 6, 6.4, 12, clay);
box('house-east-wing', 29, 3.5, 3, 6, 7, 10);
box('house-north-wing', 1, 3.8, -25, 10, 7.6, 6, clay);
box('house-gatehouse', 1, 3.2, -15, 10, 6.4, 8);
box('house-south-front', -7, 3, 26, 12, 6, 4, clay);
// Market has north/south entrances and two lateral exits.
box('market-roof', -19, 3.55, 0, 16, 0.3, 24, trim, 'roof');
box('market-west-wall', -26.5, 1.65, 0, 0.5, 3.3, 24, clay);
for (const z of [-11, 0, 11])
  box('market-pier-' + z, -11.5, 1.65, z, 0.8, 3.3, 0.8, trim, 'stone');
box('market-east-screen', -11.5, 1.65, -5.5, 0.5, 3.3, 5, clay);
box('market-stall-south', -22, 1.05, 4, 4, 2.1, 2, teal, 'metal');
box('market-stall-north', -17, 1.15, -4, 5, 2.3, 2, clay, 'stone');
box('market-counter', -23, 0.55, -8, 3, 1.1, 2, trim, 'stone');
// Solid, shallow basin and central pillar break the main sightline.
box('fountain-basin', 0, 0.45, 0, 5.2, 0.9, 5.2, trim, 'stone');
box('fountain-pedestal', 0, 1.65, 0, 1.8, 2.4, 1.8, teal, 'stone');
box('court-cart', 4.5, 1.1, 13, 3, 2.2, 2, clay, 'metal');
box('court-screen', -5.5, 1.35, -7, 3, 2.7, 1.4, teal, 'stone');
box('court-low-cover', 7.5, 0.65, -6, 2.5, 1.3, 2, sand, 'stone');
box('market-south-cart', -16, 0.65, 17, 3, 1.3, 2, teal, 'metal');
// East gallery at +3 m; 2.7 m of headroom beneath it.
box('gallery-deck', 18, 2.85, 0, 12, 0.3, 20, trim, 'stone');
for (const x of [12.5, 23.5])
  for (const z of [-9, 9])
    box(
      'gallery-pier-' + x + '-' + z,
      x,
      1.35,
      z,
      0.8,
      2.7,
      0.8,
      sand,
      'stone',
    );
box('house-gallery-office', 22, 5.3, -4, 4, 4.6, 7, clay);
box('gallery-east-parapet', 23.85, 3.5, 6, 0.3, 1, 8, teal, 'stone');
for (const z of [-6.5, 6.5])
  box('gallery-west-parapet-' + z, 12.15, 3.5, z, 0.3, 1, 7, teal, 'stone');
box('gallery-sight-screen', 17, 3.95, 0, 3, 1.9, 0.7, clay);
box('gallery-ground-cover', 21.5, 0.75, 4, 2, 1.5, 2, teal, 'metal');
// Opposite continuous slopes and an open central drop-off.
for (const side of [-1, 1])
  blocks.push({
    id: 'gallery-ramp-' + side,
    shape: 'ramp',
    position: { x: 18, y: 1.5, z: side * 14.5 },
    size: { x: 9, y: 3, z: 4 },
    yaw: (side * Math.PI) / 2,
    color: trim,
    surface: 'stone',
  });
box('north-market-cover', -17, 0.7, -20, 3, 1.4, 2, teal, 'metal');
box('north-east-cover', 24, 1.15, -22, 3, 2.3, 2, clay, 'stone');
box('north-west-screen', -27, 1.5, -21, 0.6, 3, 7);
box('south-west-screen', -26, 1.4, 18, 0.6, 2.8, 6, clay);
box('south-east-screen', 27, 1.5, 17, 0.6, 3, 8, clay);
box('gate-west-pier', -8, 2, -14, 1, 4, 1, trim, 'stone');
box('gate-east-pier', -12, 2, -14, 1, 4, 1, trim, 'stone');
box('gate-lintel', -10, 4, -14, 5, 0.6, 1, trim, 'stone');
for (const b of blocks.filter((b) => b.id.startsWith('house-')))
  box(
    'cap-' + b.id,
    b.position.x,
    b.position.y + b.size.y / 2 + 0.12,
    b.position.z,
    b.size.x + 0.25,
    0.24,
    b.size.z + 0.25,
    trim,
    'roof',
  );

export const SANDGATE: MapDefinition = withSupplyCrates({
  id: 'sandgate',
  name: 'Sandgate',
  description:
    'Пустынный рынок вокруг фонтана: крытый базар с боковыми выходами, восточная галерея с двумя пандусами и проходом снизу, северные ворота.',
  navigationHeights: [2.5, 4.9],
  upperLevel: 2.7,
  zones: [
    { name: 'ГАЛЕРЕЯ', x: 18, z: 0, radius: 13, level: 1 },
    { name: 'ПЛОЩАДЬ', x: 0, z: 19, radius: 12 },
    { name: 'РЫНОК', x: -19, z: 0, radius: 15 },
    { name: 'АРКАДА', x: 18, z: 0, radius: 13 },
    { name: 'ВОРОТА', x: -10, z: -19, radius: 12 },
    { name: 'ВОСТОЧНЫЙ ДВОР', x: 23, z: -19, radius: 10 },
    { name: 'ФОНТАН', x: 0, z: 0, radius: 14 },
  ],
  supplies: [
    { x: -23, y: 0.6, z: 9 },
    { x: 21, y: 3.6, z: 7 },
  ],
  medkits: [
    { x: -17, y: 0.6, z: -16 },
    { x: 23, y: 0.6, z: 16 },
  ],
  tacticalPositions: [
    { id: 'plaza', position: { x: 0, y: 0.03, z: 18 }, role: 'guard' },
    { id: 'market-south', position: { x: -19, y: 0.03, z: 9 }, role: 'flank' },
    { id: 'market-north', position: { x: -21, y: 0.03, z: -7 }, role: 'flank' },
    {
      id: 'fountain-west',
      position: { x: -6, y: 0.03, z: 3 },
      role: 'advance',
    },
    { id: 'fountain-east', position: { x: 7, y: 0.03, z: 3 }, role: 'guard' },
    { id: 'arcade', position: { x: 15, y: 0.03, z: -3 }, role: 'flank' },
    {
      id: 'gallery-south',
      position: { x: 17, y: 3.03, z: 6 },
      role: 'overwatch',
    },
    {
      id: 'gallery-north',
      position: { x: 17, y: 3.03, z: -6 },
      role: 'overwatch',
    },
    { id: 'gate', position: { x: -10, y: 0.03, z: -18 }, role: 'advance' },
    { id: 'east-court', position: { x: 23, y: 0.03, z: -16 }, role: 'guard' },
  ],
  spawns: [
    { x: 0, y: 0.03, z: 20 },
    { x: -22, y: 0.03, z: -16 },
    { x: 25, y: 0.03, z: -16 },
    { x: -8, y: 0.03, z: -24 },
    { x: -20, y: 0.03, z: 8 },
    { x: 23, y: 0.03, z: 18 },
    { x: 17, y: 3.03, z: -6 },
    { x: 17, y: 3.03, z: 6 },
  ],
  defense: {
    concealedSpawns: true,
    players: [
      { x: 0, y: 0.03, z: 20 },
      { x: 2, y: 0.03, z: 20 },
      { x: -2, y: 0.03, z: 20 },
      { x: 0, y: 0.03, z: 18 },
    ],
    enemies: [
      { x: -29, y: 0.03, z: -24 },
      { x: -8, y: 0.03, z: -26 },
      { x: 28, y: 0.03, z: -19 },
      { x: 29, y: 0.03, z: 20 },
      { x: -29, y: 0.03, z: 19 },
    ],
  },
  landmarks: [
    {
      text: 'SOUK / MARKET',
      position: { x: -19, y: 3.55, z: 12.2 },
      yaw: 0,
      color: 0x83d6cc,
    },
    {
      text: 'NORTH GATE',
      position: { x: -10, y: 4, z: -13.45 },
      yaw: 0,
      color: 0xffcf87,
    },
    {
      text: 'GALLERY / UPPER',
      position: { x: 18, y: 2.85, z: 10.2 },
      yaw: 0,
      color: 0xffcf87,
    },
    {
      text: 'ARCADE / LOWER',
      position: { x: 12, y: 2.3, z: 3 },
      yaw: -Math.PI / 2,
      color: 0x83d6cc,
    },
  ],
  blocks,
});
