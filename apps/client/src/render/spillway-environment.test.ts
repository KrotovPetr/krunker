import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SPILLWAY, CITY, ARENA, SANDGATE, mapLocalPoint } from '@fps/game-core';
import { createEnvironment } from './environment.js';

beforeEach(() => {
  // Only raster texture drawing needs a canvas. The real meshes, transforms
  // and Three.js raycaster remain in this regression test.
  const context = new Proxy({}, { get: () => () => {} });
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context,
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

it.each(['full', 'reduced'] as const)(
  '%s visuals preserve the city doors, market exits and under-decks',
  (quality) => {
    for (const [map, segments] of [
      [
        SANDGATE,
        [
          [
            [15, 1.7, 12],
            [15, 1.7, -12],
          ],
          [
            [-14, 1.7, 6],
            [-9, 1.7, 6],
          ],
          [
            [-14, 1.7, -1.5],
            [-9, 1.7, -1.5],
          ],
          [
            [-10, 1.7, -16],
            [-10, 1.7, -12],
          ],
        ],
      ],
      [
        CITY,
        [
          [
            [-19, 1.7, 4],
            [-19, 1.7, 2],
          ],
          [
            [-19, 1.7, -16],
            [-19, 1.7, -14],
          ],
          [
            [-11, 1.7, -7],
            [-9, 1.7, -7],
          ],
          [
            [18, 1.7, 14],
            [18, 1.7, 12],
          ],
          [
            [18, 1.7, -8],
            [18, 1.7, -6],
          ],
          [
            [9, 1.7, 4],
            [11, 1.7, 4],
          ],
          [
            [0, 1.7, -8],
            [0, 1.7, -2],
          ],
        ],
      ],
      [
        ARENA,
        [
          [
            [5, 1.7, -11],
            [5, 1.7, -23],
          ],
          [
            [-5, 1.7, 11],
            [-5, 1.7, 23],
          ],
        ],
      ],
    ] as const) {
      const env = createEnvironment(map, quality);
      try {
        env.root.updateMatrixWorld(true);
        for (const [from, to] of segments) {
          const start = new THREE.Vector3(...from),
            end = new THREE.Vector3(...to);
          const ray = new THREE.Raycaster(
            start,
            end.clone().sub(start).normalize(),
            0,
            start.distanceTo(end),
          );
          expect(
            ray.intersectObject(env.root, true),
            map.id + ':' + from,
          ).toHaveLength(0);
        }
      } finally {
        env.dispose();
      }
    }
  },
);

it.each(['full', 'reduced'] as const)(
  '%s visuals leave every collector entrance open',
  (quality) => {
    const env = createEnvironment(SPILLWAY, quality);
    try {
      env.root.updateMatrixWorld(true);
      for (const [from, to] of [
        [
          [-19, 1.5, 5],
          [-17, 1.5, 5],
        ],
        [
          [17, 1.5, 5],
          [15, 1.5, 5],
        ],
        [
          [4.5, 1.5, 20],
          [4.5, 1.5, 18],
        ],
      ] as const) {
        const start = new THREE.Vector3(...from),
          end = new THREE.Vector3(...to);
        const ray = new THREE.Raycaster(
          start,
          end.clone().sub(start).normalize(),
          0,
          start.distanceTo(end),
        );
        expect(
          ray.intersectObject(env.root, true),
          `${from} → ${to}`,
        ).toHaveLength(0);
      }
    } finally {
      env.dispose();
    }
  },
);

it('mounts railings along the physical bridge, including both ends', () => {
  const env = createEnvironment(SPILLWAY),
    bridge = SPILLWAY.blocks.find((b) => b.id === 'bridge-deck')!;
  try {
    env.root.updateMatrixWorld(true);
    for (const along of [-20, 0, 20])
      for (const side of [-2.85, 2.85]) {
        const p = mapLocalPoint(bridge, along, 0, side);
        const ray = new THREE.Raycaster(
          new THREE.Vector3(p.x, 4.9, p.z),
          new THREE.Vector3(0, -1, 0),
          0,
          0.5,
        );
        expect(ray.intersectObject(env.root, true).length).toBeGreaterThan(0);
      }
  } finally {
    env.dispose();
  }
});
