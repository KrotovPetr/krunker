import * as THREE from 'three';
import { FIREARMS, equippedWeapon } from '@fps/game-core';
import type { PlayerSnapshot } from '@fps/protocol';

export function createViewWeapon(camera: THREE.Camera) {
  const root = new THREE.Group();
  camera.add(root);
  const metal = new THREE.MeshStandardMaterial({
    color: 0x59717b,
    metalness: 0.25,
    roughness: 0.6,
    emissive: 0x15252a,
    emissiveIntensity: 0.4,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x223239,
    roughness: 0.75,
    emissive: 0x09151a,
    emissiveIntensity: 0.25,
  });
  const grip = new THREE.MeshStandardMaterial({
    color: 0xae7757,
    roughness: 0.9,
  });
  const box = (size: number[], position: number[], material = metal) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      material,
    );
    mesh.position.set(position[0]!, position[1]!, position[2]!);
    root.add(mesh);
    return mesh;
  };
  const receiver = box([0.12, 0.13, 0.46], [0, 0, -0.16]);
  const barrel = box([0.045, 0.045, 0.42], [0, 0.02, -0.57], dark);
  const stock = box([0.1, 0.12, 0.23], [0, -0.02, 0.13], grip);
  const magazine = box([0.065, 0.19, 0.1], [0, -0.14, -0.12], dark);
  const bolt = box([0.02, 0.035, 0.1], [0.07, 0.02, -0.14]);
  const hand = box([0.085, 0.11, 0.14], [0.035, -0.11, 0.04], grip);
  const frontSight = box([0.01, 0.055, 0.015], [0, 0.06, -0.56], dark);
  const optic = new THREE.Group();
  root.add(optic);
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.27, 16),
    dark,
  );
  tube.rotation.x = Math.PI / 2;
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.038, 24),
    new THREE.MeshBasicMaterial({ color: 0x6bdac7 }),
  );
  glass.position.z = 0.136;
  optic.add(tube, glass);
  optic.position.set(0, 0.1, -0.17);
  const blade = box(
    [0.035, 0.065, 0.4],
    [0, 0, -0.25],
    new THREE.MeshStandardMaterial({
      color: 0xc1d4d5,
      metalness: 0.9,
      roughness: 0.18,
    }),
  );
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 0.12, 8),
    new THREE.MeshStandardMaterial({
      color: 0x899898,
      metalness: 0.3,
      roughness: 0.55,
    }),
  );
  cylinder.rotation.x = Math.PI / 2;
  cylinder.position.set(0, -0.01, -0.17);
  root.add(cylinder);
  const rail = box([0.11, 0.018, 0.24], [0, 0.075, -0.23], dark);
  const flash = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.07),
    new THREE.MeshBasicMaterial({ color: 0xffca65 }),
  );
  root.add(flash);
  let kick = 0,
    flashTime = 0,
    knifeTime = 0,
    walkPhase = 0,
    switchRemaining = 0,
    lastWeapon = '';
  return {
    shot(knife: boolean) {
      kick = knife ? 0.23 : 0.1;
      flashTime = knife ? 0 : 0.05;
      knifeTime = knife ? 0.28 : 0;
    },
    update(
      dt: number,
      player: PlayerSnapshot | undefined,
      firstPerson: boolean,
      aiming: boolean,
    ) {
      if (!player) {
        root.visible = false;
        return 75;
      }
      const id = equippedWeapon(player),
        config = FIREARMS[id];
      if (id !== lastWeapon) {
        switchRemaining = 0.22;
        lastWeapon = id;
      }
      kick *= Math.exp(-18 * dt);
      flashTime = Math.max(0, flashTime - dt);
      knifeTime = Math.max(0, knifeTime - dt);
      switchRemaining = Math.max(0, switchRemaining - dt);
      const ads =
        firstPerson && aiming && player.reloadRemaining <= 0
          ? player.aimProgress
          : 0;
      const reload =
        player.reloadRemaining > 0
          ? Math.sin(
              Math.PI *
                (1 - Math.min(1, player.reloadRemaining / config.reload)),
            )
          : 0;
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      walkPhase += speed * dt * 2.5;
      const bob =
        player.grounded && !player.sliding
          ? Math.min(speed / 10, 1) * (1 - ads)
          : 0;
      root.position.set(
        0.23 * (1 - ads) + Math.sin(walkPhase) * bob * 0.009,
        -0.24 +
          ads * 0.105 -
          reload * 0.2 -
          switchRemaining * 0.5 +
          Math.cos(walkPhase * 2) * bob * 0.008,
        -0.36 + kick,
      );
      root.rotation.set(
        reload * 0.65 + (player.sliding ? 0.05 : 0),
        reload * -0.25,
        -reload * 0.45 + Math.sin(knifeTime * 16) * (knifeTime > 0 ? 0.7 : 0),
      );
      root.visible =
        firstPerson && player.health > 0 && !(id === 'sniper' && ads > 0.8);
      for (const mesh of [receiver, barrel, stock, magazine, bolt, frontSight])
        mesh.visible = knifeTime === 0;
      hand.visible = true;
      blade.visible = knifeTime > 0;
      optic.visible = id === 'sniper' && knifeTime === 0;
      const handgun = id === 'pistol' || id === 'revolver';
      cylinder.visible = id === 'revolver' && knifeTime === 0;
      cylinder.rotation.z = reload * Math.PI * 4;
      rail.visible = id === 'smg' && knifeTime === 0;
      receiver.scale.set(
        id === 'shotgun' ? 1.3 : 1,
        1,
        handgun ? 0.45 : id === 'smg' ? 0.72 : 1,
      );
      barrel.scale.z =
        id === 'sniper'
          ? 1.4
          : id === 'revolver'
            ? 0.6
            : id === 'pistol'
              ? 0.25
              : id === 'smg'
                ? 0.65
                : 1;
      barrel.position.z = handgun ? -0.33 : id === 'smg' ? -0.44 : -0.57;
      stock.visible &&= !handgun;
      magazine.visible &&= id !== 'revolver';
      frontSight.position.z = handgun ? -0.35 : id === 'smg' ? -0.45 : -0.56;
      magazine.position.y = -0.14 - reload * 0.2;
      bolt.position.z = -0.14 + kick * 0.6;
      flash.position.set(0, 0.02, barrel.position.z - 0.21 * barrel.scale.z);
      flash.visible = flashTime > 0;
      flash.rotation.z += dt * 30;
      return 75 + ((id === 'sniper' ? 28 : 55) - 75) * ads;
    },
  };
}
