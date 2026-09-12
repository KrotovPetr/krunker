import { expect, it } from 'vitest';
import * as THREE from 'three';
import { emptyMission } from '@fps/game-core';
import type { GameSnapshot } from '@fps/protocol';
import { createMissionVisuals } from './mission.js';

it('animates departure only in the finale and restores the tram, lights and markers on leaving', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const tram = new THREE.Group();
  const visuals = createMissionVisuals(scene);
  const mission = {
    ...emptyMission(1),
    stage: 'departing' as const,
    progress: 4,
  };
  const snapshot = { mode: 'mission', mission } as GameSnapshot;
  visuals.snapshot(snapshot);
  const objects: THREE.Object3D[] = [];
  scene.traverse((o) => objects.push(o));
  expect(objects.some((o) => o instanceof THREE.Light)).toBe(false);
  expect(visuals.frame(0, camera, tram, true, false)).toEqual({
    cinematic: true,
    blackout: true,
  });
  expect(tram.position.z).toBeGreaterThan(0);
  expect(tram.position.z).toBeLessThan(7);
  for (let i = 0; i < 1000; i++)
    visuals.frame(1 / 60, camera, tram, true, false);
  expect(tram.position.z).toBe(7);
  visuals.snapshot({ ...snapshot, mode: 'control' });
  expect(visuals.frame(0, camera, tram, true, false)).toEqual({
    cinematic: false,
    blackout: false,
  });
  expect(tram.position.z).toBe(0);
  expect(scene.children[0]!.visible).toBe(false);
  visuals.dispose();
  expect(scene.children).toHaveLength(0);
});
