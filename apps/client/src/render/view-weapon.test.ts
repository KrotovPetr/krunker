import { beforeAll, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createGame,
  DEFAULT_CONFIG,
  initializePhysics,
  TEST_PAD,
} from '@fps/game-core';
import { createViewWeapon } from './view-weapon.js';
beforeAll(initializePhysics);

it('keeps the knife mesh visible after the stab animation and hides it when switching back', () => {
  const game = createGame(DEFAULT_CONFIG, TEST_PAD, 0);
  game.enqueue({ type: 'join', playerId: 'a', nickname: 'a' });
  game.step(1 / 60);
  const player = game.snapshot().players[0]!;
  const camera = new THREE.PerspectiveCamera();
  const view = createViewWeapon(camera);
  const blade = camera.getObjectByName('knife-blade')!;
  try {
    player.slot = 'knife';
    view.update(1 / 60, player, true, false);
    expect(blade.visible).toBe(true);
    view.shot(true);
    for (let i = 0; i < 120; i++) view.update(1 / 60, player, true, false);
    expect(blade.visible).toBe(true);
    expect(blade.parent!.visible).toBe(true);
    player.slot = 'primary';
    view.update(1 / 60, player, true, false);
    expect(blade.visible).toBe(false);
  } finally {
    const materials = new Set<THREE.Material>();
    camera.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const m of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(m);
      }
    });
    for (const material of materials) material.dispose();
    game.dispose();
  }
});
