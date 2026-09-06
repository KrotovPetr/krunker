import type { MapDefinition } from './arena.js';
export type { MapDefinition } from './arena.js';

export const TEST_PAD: MapDefinition = {
  id: 'test-pad',
  blocks: [
    {
      id: 'floor',
      shape: 'box',
      yaw: 0,
      position: { x: 0, y: -0.25, z: 0 },
      size: { x: 20, y: 0.5, z: 20 },
      color: 0x233436,
    },
  ],
  spawns: Array.from({ length: 8 }, (_, index) => ({
    x: Math.cos((index * Math.PI) / 4) * 5,
    y: 0,
    z: Math.sin((index * Math.PI) / 4) * 5,
  })),
};
