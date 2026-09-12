import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createTracers } from './tracers.js';

it('reuses a single bounded buffer through sustained fire, reset and disposal', () => {
  const scene = new THREE.Scene(),
    tracers = createTracers(scene);
  const lines = scene.children[0] as THREE.LineSegments;
  const buffer = lines.geometry.getAttribute('position');
  for (let i = 0; i < 1000; i++)
    tracers.event(
      {
        type: 'shot',
        playerId: 'p',
        weapon: 'shotgun',
        origin: { x: 1, y: 2, z: 3 },
        ends: Array.from({ length: 8 }, () => ({ x: 4, y: 5, z: 6 })),
      },
      'p',
    );
  expect(scene.children).toHaveLength(1);
  expect(lines.geometry.getAttribute('position')).toBe(buffer);
  expect(buffer.count).toBe(128);
  expect(lines.visible).toBe(true);
  tracers.update(0.1);
  expect(lines.visible).toBe(false);
  expect([...buffer.array].every((n) => n === 0)).toBe(true);
  tracers.reset();
  tracers.dispose();
  expect(scene.children).toHaveLength(0);
});
