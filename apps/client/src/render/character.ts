import * as THREE from 'three';
import type { PlayerSnapshot } from '@fps/protocol';
import { playerColor } from './player-colors.js';

/** Visual rig stays within the body/head hitboxes; weapons are cosmetic. */
export function createCharacter(bot: boolean) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  body.position.y = -0.9;
  const cloth = new THREE.MeshStandardMaterial({
    color: bot ? 0xa16549 : 0x507d8a,
    roughness: 0.9,
  });
  const armor = new THREE.MeshStandardMaterial({
    color: bot ? 0x5c4438 : 0x293f49,
    roughness: 0.7,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1f2c32,
    roughness: 0.6,
  });
  const visor = new THREE.MeshStandardMaterial({
    color: bot ? 0xe8b86e : 0x86d2df,
    metalness: 0.3,
    roughness: 0.2,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x48c6b2,
    roughness: 0.75,
  });
  const geometries: THREE.BufferGeometry[] = [];
  const box = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material,
  ) => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const hips = new THREE.Group();
  hips.position.y = 0.78;
  body.add(hips);
  const legs = [-1, 1].map((side) => {
    const limb = new THREE.Group();
    limb.position.x = side * 0.13;
    hips.add(limb);
    box(limb, 0, -0.3, 0, 0.18, 0.56, 0.22, cloth);
    box(limb, 0, -0.66, -0.035, 0.2, 0.17, 0.3, dark);
    return limb;
  });
  const torsoGeo = new THREE.CylinderGeometry(0.26, 0.22, 0.58, 6);
  geometries.push(torsoGeo);
  const torso = new THREE.Mesh(torsoGeo, cloth);
  torso.position.y = 1.1;
  body.add(torso);
  box(body, 0, 1.1, -0.2, 0.34, 0.38, 0.11, armor);
  box(body, 0, 1.24, -0.265, 0.29, 0.06, 0.025, accent);
  box(body, 0, 1.15, 0.235, 0.28, 0.12, 0.025, accent);
  box(body, -0.1, 0.99, -0.28, 0.08, 0.16, 0.06, dark);
  box(body, 0.1, 0.99, -0.28, 0.08, 0.16, 0.06, dark);
  const head = new THREE.Group();
  head.position.y = 1.61;
  body.add(head);
  const helmetGeo = new THREE.IcosahedronGeometry(0.23, 1);
  geometries.push(helmetGeo);
  head.add(new THREE.Mesh(helmetGeo, armor));
  box(head, 0, 0.025, -0.19, 0.32, 0.11, 0.045, visor);
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.24, 1.3, 0);
    body.add(arm);
    box(arm, 0, -0.19, 0, 0.14, 0.4, 0.16, cloth);
    box(arm, 0, -0.13, 0, 0.155, 0.08, 0.175, accent);
    box(arm, 0, -0.4, 0, 0.15, 0.12, 0.16, dark);
    return arm;
  });
  const gun = new THREE.Group();
  gun.position.set(0.12, 1.14, -0.23);
  body.add(gun);
  const receiver = box(gun, 0, 0, -0.12, 0.1, 0.12, 0.42, dark);
  const barrel = box(gun, 0, 0.02, -0.41, 0.035, 0.035, 0.24, armor);
  const magazine = box(gun, 0, -0.13, -0.1, 0.05, 0.2, 0.08, armor);
  const knife = box(gun, 0, 0, -0.22, 0.025, 0.055, 0.3, visor);
  const knifeGrip = box(gun, 0, 0, -0.01, 0.05, 0.065, 0.13, dark);
  const flashGeo = new THREE.OctahedronGeometry(0.085);
  geometries.push(flashGeo);
  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd98c });
  const flash = new THREE.Mesh(flashGeo, flashMaterial);
  flash.position.z = -0.57;
  gun.add(flash);
  const shieldGeo = new THREE.SphereGeometry(0.64, 12, 8);
  geometries.push(shieldGeo);
  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: 0x7dccff,
    wireframe: true,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  const shield = new THREE.Mesh(shieldGeo, shieldMaterial);
  shield.scale.y = 1.65;
  root.add(shield);
  let walk = 0,
    shotRemaining = 0,
    deathAge = 10,
    lastLife = -1,
    wasAlive = false;
  return {
    root,
    setAppearance(index: number, friendly: boolean) {
      const color = playerColor(index, friendly);
      cloth.color.setHex(color).multiplyScalar(0.7);
      accent.color.setHex(color);
      armor.color.setHex(friendly ? 0x293f49 : 0x503b35);
      visor.color.setHex(friendly ? 0x9edce7 : 0xf0c493);
      root.userData.memberColor = color;
    },
    shot() {
      shotRemaining = 0.09;
    },
    update(player: PlayerSnapshot, dt: number) {
      if (lastLife !== player.lifeId) {
        wasAlive = player.health > 0;
        deathAge = player.health > 0 ? 0 : 10;
        lastLife = player.lifeId;
      }
      if (player.health > 0) {
        wasAlive = true;
        deathAge = 0;
      } else deathAge += dt;
      const dead = player.health <= 0;
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      walk += dt * speed * 3.4;
      shotRemaining = Math.max(0, shotRemaining - dt);
      const stride = player.grounded ? Math.min(0.65, speed * 0.06) : 0;
      legs.forEach(
        (leg, i) =>
          (leg.rotation.x = dead
            ? 0
            : player.sliding
              ? -0.9
              : !player.grounded
                ? i
                  ? -0.45
                  : 0.4
                : Math.sin(walk + i * Math.PI) * stride),
      );
      arms.forEach((arm, i) => {
        arm.rotation.x =
          -1.1 -
          player.pitch * 0.3 +
          (player.reloadRemaining > 0 && i === 0
            ? Math.sin(player.reloadRemaining * 9) * 0.3
            : 0);
        arm.rotation.z = i ? -0.12 : 0.12;
      });
      head.rotation.x = player.pitch * 0.6;
      gun.rotation.x = player.pitch;
      gun.position.z = -0.23 + shotRemaining * 0.5;
      const melee = player.slot === 'knife';
      receiver.visible = barrel.visible = magazine.visible = !melee;
      knife.visible = knifeGrip.visible = melee;
      if (melee) gun.position.z = -0.23 - shotRemaining;
      torso.scale.x =
        player.weapon === 'shotgun' ? 1.1 : player.weapon === 'smg' ? 0.9 : 1;
      const short = player.slot === 'secondary' || player.weapon === 'revolver';
      const machineGun = player.weapon === 'lmg' && !short;
      receiver.scale.x = machineGun ? 1.5 : 1;
      magazine.scale.set(
        machineGun ? 3 : 1,
        machineGun ? 1.2 : 1,
        machineGun ? 2 : 1,
      );
      receiver.scale.z = short ? 0.55 : player.weapon === 'smg' ? 0.8 : 1;
      barrel.scale.z =
        player.weapon === 'sniper' && !short
          ? 1.7
          : machineGun
            ? 1.5
            : short
              ? 0.4
              : 1;
      flash.position.z = -0.41 - 0.12 * barrel.scale.z;
      flash.visible = !melee && shotRemaining > 0 && !dead;
      shield.visible = player.protectionRemaining > 0 && !dead;
      shield.rotation.y += dt * 0.7;
      body.rotation.z = dead
        ? Math.min(1.45, deathAge * 5)
        : player.sliding
          ? 0.12
          : 0;
      body.position.y = -0.9 + (dead ? Math.min(0.25, deathAge * 1.5) : 0);
      return !dead || (wasAlive && deathAge < 2.7);
    },
    dispose() {
      root.removeFromParent();
      geometries.forEach((g) => g.dispose());
      for (const m of [
        cloth,
        armor,
        dark,
        visor,
        accent,
        flashMaterial,
        shieldMaterial,
      ])
        m.dispose();
    },
  };
}
