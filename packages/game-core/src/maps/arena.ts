import type { Vec3 } from '@fps/protocol';

export interface MapBlock {
  id: string;
  shape: 'box' | 'ramp';
  position: Vec3;
  size: Vec3;
  yaw: number;
  color: number;
  surface?:
    'plaster' | 'stone' | 'asphalt' | 'paving' | 'metal' | 'roof' | 'concrete';
}
export interface MapDefinition {
  control?: {
    position: Vec3;
    radius: number;
    allies: readonly Vec3[];
    enemies: readonly Vec3[];
  };
  id: string;
  name?: string;
  description?: string;
  supplies?: ReadonlyArray<Vec3>;
  medkits?: ReadonlyArray<Vec3>;
  navigationHeights?: readonly number[];
  upperLevel?: number;
  tacticalPositions?: ReadonlyArray<{
    id: string;
    position: Vec3;
    role: 'advance' | 'flank' | 'overwatch' | 'guard';
  }>;
  zones?: ReadonlyArray<{
    name: string;
    x: number;
    z: number;
    radius: number;
    level?: number;
  }>;
  blocks: ReadonlyArray<MapBlock>;
  spawns: ReadonlyArray<Vec3>;
  landmarks?: ReadonlyArray<{
    text: string;
    position: Vec3;
    yaw: number;
    color: number;
  }>;
  defense?: {
    players: ReadonlyArray<Vec3>;
    enemies: ReadonlyArray<Vec3>;
    concealedSpawns?: boolean;
  };
  practice?: {
    spawns: ReadonlyArray<Vec3>;
    targets: ReadonlyArray<{ id: string; position: Vec3 }>;
  };
}

/** Same right-handed Y rotation as Three.js and Rapier. */
export function mapLocalPoint(
  block: Pick<MapBlock, 'position' | 'yaw'>,
  x: number,
  y: number,
  z: number,
): Vec3 {
  return {
    x: block.position.x + Math.cos(block.yaw) * x + Math.sin(block.yaw) * z,
    y: block.position.y + y,
    z: block.position.z - Math.sin(block.yaw) * x + Math.cos(block.yaw) * z,
  };
}

function box(
  id: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color = 0x727f81,
): MapBlock {
  return {
    id,
    shape: 'box',
    position: { x, y, z },
    size: { x: sx, y: sy, z: sz },
    yaw: 0,
    color,
  };
}

export function withSupplyCrates(map: MapDefinition): MapDefinition {
  return {
    ...map,
    blocks: [
      ...map.blocks,
      ...(map.supplies ?? []).map((p, i): MapBlock => ({
        id: 'supply-' + i,
        shape: 'box',
        yaw: 0,
        position: { x: p.x, y: p.y - 0.4, z: p.z },
        size: { x: 0.9, y: 0.4, z: 0.65 },
        color: 0x3c7162,
        surface: 'metal',
      })),
      ...(map.medkits ?? []).map((p, i): MapBlock => ({
        id: 'medkit-' + i,
        shape: 'box',
        yaw: 0,
        position: { x: p.x, y: p.y - 0.4, z: p.z },
        size: { x: 0.9, y: 0.4, z: 0.65 },
        color: 0xe5eadc,
        surface: 'metal',
      })),
    ],
  };
}
export const ARENA: MapDefinition = withSupplyCrates({
  id: 'switchyard',
  name: 'Switchyard',
  navigationHeights: [2.4, 4.9],
  supplies: [
    { x: -3, y: 0.6, z: 9 },
    { x: -23, y: 0.6, z: -5 },
  ],
  medkits: [
    { x: 22, y: 0.6, z: 5 },
    { x: -8, y: 3.6, z: 19 },
  ],
  description:
    'Литейная и охладительная станция на открытых опорах. Под обеими платформами проходят сквозные маршруты в полный рост. Наверх ведут плавные пандусы; центральный низкий переход требует присесть.',
  zones: [
    { name: 'ЛИТЕЙНАЯ', x: 0, z: -17, radius: 13 },
    { name: 'ОХЛАЖДЕНИЕ', x: 0, z: 17, radius: 13 },
    { name: 'ПЕРЕХОД', x: 0, z: 0, radius: 10 },
    { name: 'ПОЛИГОН', x: -25, z: 0, radius: 24 },
  ],
  defense: {
    players: [
      { x: 0, y: 0.03, z: 8 },
      { x: -2, y: 0.03, z: 8 },
      { x: 2, y: 0.03, z: 8 },
      { x: 0, y: 0.03, z: 10 },
    ],
    enemies: [
      { x: -21, y: 0.03, z: -10 },
      { x: 21, y: 0.03, z: -10 },
      { x: -8, y: 3.03, z: -17 },
      { x: 8, y: 3.03, z: -17 },
    ],
  },
  landmarks: [
    {
      text: 'A / LOWER WALK',
      position: { x: 5, y: 2.9, z: -12.98 },
      yaw: 0,
      color: 0xe3a559,
    },
    {
      text: 'B / LOWER WALK',
      position: { x: -5, y: 2.9, z: 12.98 },
      yaw: Math.PI,
      color: 0x62c9c0,
    },
    {
      text: 'A / FOUNDRY',
      position: { x: 0, y: 5.4, z: -20.9 },
      yaw: 0,
      color: 0xe3a559,
    },
    {
      text: 'B / COOLING',
      position: { x: 0, y: 5.4, z: 20.9 },
      yaw: Math.PI,
      color: 0x62c9c0,
    },
    {
      text: '03 / UNDERPASS',
      position: { x: 0, y: 1.65, z: 3.52 },
      yaw: 0,
      color: 0xb5c7cb,
    },
    {
      text: 'RANGE',
      position: { x: -25, y: 3.5, z: -24 },
      yaw: 0,
      color: 0xe3a559,
    },
  ],
  practice: {
    spawns: Array.from({ length: 8 }, (_, i) => ({
      x: -25,
      y: 0.03,
      z: 2 + i * 1.8,
    })),
    targets: [
      { id: 'range-near', position: { x: -25, y: 0.03, z: -5 } },
      { id: 'range-mid', position: { x: -26.5, y: 0.03, z: -12 } },
      { id: 'range-far', position: { x: -25, y: 0.03, z: -22 } },
    ],
  },
  blocks: [
    box('floor', 0, -0.5, 0, 56, 1, 48, 0x536665),
    box('west-wall', -28.5, 3, 0, 1, 6, 50, 0x9eafa8),
    box('east-wall', 28.5, 3, 0, 1, 6, 50, 0x9eafa8),
    box('north-wall', 0, 3, -24.5, 56, 6, 1, 0x9eafa8),
    box('south-wall', 0, 3, 24.5, 56, 6, 1, 0x9eafa8),
    box('north-deck', 0, 2.8, -17, 24, 0.4, 8, 0xc3926d),
    box('south-deck', 0, 2.8, 17, 24, 0.4, 8, 0x729c9e),
    ...[-1, 1].flatMap((side) =>
      [-10.5, 0, 10.5].flatMap((x) =>
        [-3.2, 3.2].map((dz) =>
          box(
            'deck-support-' + side + '-' + x + '-' + dz,
            x,
            1.3,
            side * 17 + dz,
            0.8,
            2.6,
            0.8,
            side < 0 ? 0xa27451 : 0x537e80,
          ),
        ),
      ),
    ),
    { ...box('north-ramp', -18, 1.5, -17, 12, 3, 6, 0xc3926d), shape: 'ramp' },
    {
      ...box('south-ramp', 18, 1.5, 17, 12, 3, 6, 0x729c9e),
      shape: 'ramp',
      yaw: Math.PI,
    },
    box('foundry-back', 0, 4.6, -21.3, 24, 3.2, 0.6, 0x997453),
    box('foundry-roof', 0, 6.3, -18.5, 24, 0.4, 6.2, 0x46585c),
    box('foundry-pillar-left', -11.6, 4.6, -15.5, 0.6, 3.2, 0.6, 0x48585a),
    box('foundry-pillar-right', 11.6, 4.6, -15.5, 0.6, 3.2, 0.6, 0x48585a),
    box('cooling-back', 0, 4.6, 21.3, 24, 3.2, 0.6, 0x558c8e),
    box('cooling-roof', 0, 6.3, 18.5, 24, 0.4, 6.2, 0x46585c),
    box('cooling-pillar-left', -11.6, 4.6, 15.5, 0.6, 3.2, 0.6, 0x48585a),
    box('cooling-pillar-right', 11.6, 4.6, 15.5, 0.6, 3.2, 0.6, 0x48585a),
    box('foundry-stack', -5, 7.7, -19, 2.2, 2.4, 2.2, 0x5e6663),
    box('cooling-tank', 5, 7.5, 19, 4, 2, 3, 0x86b7b3),
    {
      ...box('south-west-ramp', -18, 1.5, 17, 12, 3, 6, 0x729c9e),
      shape: 'ramp',
    },
    box('north-jump-low', -5, 0.55, -8.5, 2.5, 1.1, 2.2, 0xb98c60),
    box('north-jump-high', -5, 1.05, -12, 2.5, 2.1, 2, 0xb98c60),
    box('south-jump-low', 5, 0.55, 8.5, 2.5, 1.1, 2.2, 0x74aaa4),
    box('south-jump-high', 5, 1.05, 12, 2.5, 2.1, 2, 0x74aaa4),
    box('west-service-cover', -16, 1.2, -2.5, 3, 2.4, 5, 0xbfa97b),
    box('east-service-cover', 16, 1.2, 2.5, 3, 2.4, 5, 0x789d9e),
    {
      ...box('underpass-ramp', 6.5, 1.025, 0, 6, 2.05, 3, 0x869a97),
      shape: 'ramp',
      yaw: Math.PI,
    },
    box('cover-nw', -9, 1.4, -5, 4, 2.8, 4, 0xd3a777),
    box('cover-se', 9, 1.4, 5, 4, 2.8, 4, 0x91bbb1),
    box('cover-ne', 9, 0.6, -6, 3, 1.2, 5, 0x91bbb1),
    box('cover-sw', -9, 0.6, 6, 3, 1.2, 5, 0xd3a777),
    box('tunnel-roof', 0, 1.65, 0, 6, 0.8, 7, 0xc3cac1),
    box('tunnel-west', -3.25, 0.625, 0, 0.5, 1.25, 7, 0x7a8e88),
    box('tunnel-east', 3.25, 0.625, 0, 0.5, 1.25, 7, 0x7a8e88),
    {
      ...box('north-east-ramp', 18, 1.5, -17, 12, 3, 5, 0xc3926d),
      shape: 'ramp',
      yaw: Math.PI,
    },
  ],
  spawns: [
    { x: -21, y: 0.03, z: 0 },
    { x: 21, y: 0.03, z: 0 },
    { x: -8, y: 3.03, z: -17 },
    { x: 8, y: 3.03, z: 17 },
    { x: -20, y: 0.03, z: 10 },
    { x: 20, y: 0.03, z: -10 },
    { x: -8, y: 0.03, z: 10 },
    { x: 8, y: 0.03, z: -10 },
  ],
});

// Ramp rises along local +X. Rendering and Rapier use these same six vertices.
export function rampVertices(size: Vec3): number[] {
  const x = size.x / 2,
    y = size.y / 2,
    z = size.z / 2;
  return [-x, -y, -z, x, -y, -z, x, y, -z, -x, -y, z, x, -y, z, x, y, z];
}
export const RAMP_INDICES = [
  0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 0, 3, 5, 0, 5, 2,
];
