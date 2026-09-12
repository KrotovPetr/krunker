import { expect, it } from 'vitest';
import * as THREE from 'three';
import { emptyControl, emptySquadOrder, getMap } from '@fps/game-core';
import type { GameSnapshot } from '@fps/protocol';
import { createControlVisuals } from './control.js';

it('draws fixed ground markers after map surfaces, with wall occlusion and mode cleanup', () => {
  const scene = new THREE.Scene();
  const visuals = createControlVisuals(scene);
  const meshes = [...scene.children] as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >[];
  const snapshot = {
    mapId: 'bastion',
    mode: 'control',
    control: emptyControl(),
    squadOrder: {
      ...emptySquadOrder(),
      kind: 'hold',
      position: { x: 2, y: 0, z: 3 },
    },
  } as GameSnapshot;
  visuals.snapshot(snapshot);
  expect(meshes).toHaveLength(3);
  for (const mesh of meshes) {
    expect(mesh.visible).toBe(true);
    expect(mesh.renderOrder).toBeGreaterThan(0);
    expect(mesh.material.depthTest).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
  }
  const point = getMap('bastion').control!;
  expect(meshes[0]!.position.toArray()).toEqual([
    point.position.x,
    point.position.y + 0.02,
    point.position.z,
  ]);
  expect(meshes[0]!.scale.x).toBe(point.radius);
  expect(meshes[2]!.position.toArray()).toEqual([2, 0.025, 3]);
  visuals.snapshot({ ...snapshot, mode: 'arena' });
  expect(meshes.every((mesh) => !mesh.visible)).toBe(true);
  expect(scene.children).toHaveLength(3);
  visuals.dispose();
  expect(scene.children).toHaveLength(0);
});
