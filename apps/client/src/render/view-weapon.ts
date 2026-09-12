import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FIREARMS, equippedWeapon } from '@fps/game-core';
import type { PlayerSnapshot } from '@fps/protocol';

export function createViewWeapon(camera: THREE.Camera) {
  const root = new THREE.Group();
  root.scale.setScalar(0.86);
  camera.add(root);
  const metal = new THREE.MeshStandardMaterial({
    color: 0x556268,
    metalness: 0.45,
    roughness: 0.48,
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
    color: 0x414b48,
    roughness: 0.9,
  });
  const box = (size: number[], position: number[], material = metal) => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(
        size[0],
        size[1],
        size[2],
        1,
        Math.min(...size) * 0.14,
      ),
      material,
    );
    mesh.position.set(position[0]!, position[1]!, position[2]!);
    root.add(mesh);
    return mesh;
  };
  const receiver = box([0.12, 0.13, 0.46], [0, 0, -0.16]);
  const barrelGeometry = new THREE.CylinderGeometry(0.021, 0.025, 0.42, 10);
  barrelGeometry.rotateX(Math.PI / 2);
  const barrel = new THREE.Mesh(barrelGeometry, dark);
  barrel.position.set(0, 0.02, -0.57);
  root.add(barrel);
  const stock = box([0.1, 0.12, 0.23], [0, -0.02, 0.13], grip);
  const magazine = box([0.065, 0.19, 0.1], [0, -0.14, -0.12], dark);
  const bolt = box([0.02, 0.035, 0.1], [0.07, 0.02, -0.14]);
  const hand = box([0.075, 0.105, 0.11], [0.035, -0.11, 0.04], dark);
  magazine.rotation.x = -0.13;
  const handguard = box([0.095, 0.09, 0.23], [0, -0.005, -0.4], grip);
  const receiverTop = box([0.085, 0.025, 0.36], [0, 0.072, -0.16], dark);
  const triggerGuard = box([0.035, 0.025, 0.13], [0, -0.1, 0.01], dark);
  const muzzle = box([0.058, 0.056, 0.065], [0, 0.02, -0.76], metal);
  const rearSight = [-1, 1].map((side) =>
    box([0.014, 0.035, 0.024], [side * 0.032, 0.102, -0.015], dark),
  );
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
  blade.name = 'knife-blade';
  const knifeGrip = box([0.052, 0.065, 0.17], [0, 0, 0.035], dark);
  const knifeGuard = box([0.1, 0.025, 0.035], [0, 0, -0.065], metal);
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
  const carryHandle = box([0.035, 0.055, 0.19], [0, 0.11, -0.21], dark);
  const bipod = [-1, 1].map((side) => {
    const leg = box([0.02, 0.16, 0.025], [side * 0.065, -0.07, -0.66], dark);
    leg.rotation.z = side * 0.35;
    return leg;
  });
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
  let throwTime = 0;
  return {
    thrown() {
      throwTime = 0.35;
    },
    shot(knife: boolean) {
      kick = knife ? -0.12 : 0.1;
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
      const selected = equippedWeapon(player),
        knifeEquipped = selected === 'knife',
        id = knifeEquipped ? player.weapon : selected,
        config = FIREARMS[id];
      root.userData.equipped = selected;
      const gunVisible = !knifeEquipped && knifeTime === 0;
      metal.color.setHex(id === 'sapper' ? 0x807958 : 0x556268);
      if (selected !== lastWeapon) {
        switchRemaining = 0.22;
        lastWeapon = selected;
      }
      kick *= Math.exp(-18 * dt);
      flashTime = Math.max(0, flashTime - dt);
      knifeTime = Math.max(0, knifeTime - dt);
      switchRemaining = Math.max(0, switchRemaining - dt);
      throwTime = Math.max(0, throwTime - dt);
      const ads =
        !knifeEquipped && firstPerson && aiming && player.reloadRemaining <= 0
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
          Math.sin((throwTime / 0.35) * Math.PI) * 0.22 -
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
        mesh.visible = gunVisible;
      hand.visible = true;
      blade.visible = knifeEquipped || knifeTime > 0;
      knifeGrip.visible = knifeGuard.visible = blade.visible;
      handguard.visible = gunVisible && id !== 'pistol' && id !== 'revolver';
      receiverTop.visible = triggerGuard.visible = gunVisible;
      muzzle.visible = gunVisible;
      for (const sight of rearSight)
        sight.visible = gunVisible && id !== 'sniper';
      optic.visible = id === 'sniper' && gunVisible;
      const handgun = id === 'pistol' || id === 'revolver';
      const machineGun = id === 'lmg';
      receiverTop.scale.z = handgun ? 0.45 : id === 'smg' ? 0.72 : 1;
      handguard.scale.z = id === 'smg' ? 0.65 : machineGun ? 1.2 : 1;
      handguard.position.z = id === 'smg' ? -0.34 : -0.4;
      carryHandle.visible = machineGun && gunVisible;
      for (const leg of bipod) leg.visible = machineGun && gunVisible;
      cylinder.visible = id === 'revolver' && gunVisible;
      cylinder.rotation.z = reload * Math.PI * 4;
      rail.visible = id === 'smg' && gunVisible;
      receiver.scale.set(
        machineGun ? 1.45 : id === 'shotgun' ? 1.3 : 1,
        machineGun ? 1.2 : 1,
        handgun ? 0.45 : id === 'smg' ? 0.72 : 1,
      );
      barrel.scale.set(machineGun ? 1.6 : 1, machineGun ? 1.6 : 1, 1);
      barrel.scale.z =
        id === 'sniper'
          ? 1.4
          : machineGun
            ? 1.3
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
      magazine.scale.set(
        machineGun ? 2.8 : 1,
        machineGun ? 1.25 : 1,
        machineGun ? 1.9 : 1,
      );
      frontSight.position.z = handgun ? -0.35 : id === 'smg' ? -0.45 : -0.56;
      magazine.position.y = -0.14 - reload * 0.2;
      bolt.position.z = -0.14 + kick * 0.6;
      flash.position.set(0, 0.02, barrel.position.z - 0.21 * barrel.scale.z);
      muzzle.position.copy(flash.position);
      flash.visible = flashTime > 0 && gunVisible;
      flash.rotation.z += dt * 30;
      return 75 + ((id === 'sniper' ? 28 : 55) - 75) * ads;
    },
  };
}
