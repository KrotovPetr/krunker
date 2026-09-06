import * as THREE from 'three';
import type { ServerEvent, Vec3 } from '@fps/protocol';

/** Fixed pools bound geometry and work during sustained automatic fire. */
export function createCombatEffects(scene: THREE.Scene) {
  const root = new THREE.Group();
  scene.add(root);
  const markGeo = new THREE.CircleGeometry(0.045, 7),
    chipGeo = new THREE.BoxGeometry(0.025, 0.025, 0.035),
    shellGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.045, 6);
  const markMat = new THREE.MeshBasicMaterial({
    color: 0x3d4038,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const chipMat = new THREE.MeshBasicMaterial({ color: 0xe2c392 }),
    shellMat = new THREE.MeshStandardMaterial({
      color: 0xc89b52,
      metalness: 0.6,
      roughness: 0.4,
    });
  const pool = (
    count: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
  ) =>
    Array.from({ length: count }, () => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      root.add(mesh);
      return { mesh, age: 0, velocity: new THREE.Vector3() };
    });
  const marks = pool(96, markGeo, markMat),
    chips = pool(64, chipGeo, chipMat),
    shells = pool(24, shellGeo, shellMat);
  let mark = 0,
    chip = 0,
    shell = 0;
  const forward = new THREE.Vector3(0, 0, 1);
  return {
    event(event: ServerEvent) {
      if (event.type !== 'shot') return;
      for (const impact of event.impacts ?? []) {
        const normal = new THREE.Vector3(
          impact.normal.x,
          impact.normal.y,
          impact.normal.z,
        );
        const decal = marks[mark++ % marks.length]!;
        decal.age = 9;
        decal.mesh.visible = true;
        decal.mesh.position
          .set(impact.position.x, impact.position.y, impact.position.z)
          .addScaledVector(normal, 0.012);
        decal.mesh.quaternion.setFromUnitVectors(forward, normal);
        for (let i = 0; i < 3; i++) {
          const piece = chips[chip++ % chips.length]!;
          piece.age = 0.24 + i * 0.07;
          piece.mesh.visible = true;
          piece.mesh.position.copy(decal.mesh.position);
          piece.velocity
            .copy(normal)
            .multiplyScalar(1.5)
            .add(
              new THREE.Vector3(
                Math.sin(chip * 4) * 1.7,
                0.6 + i * 0.5,
                Math.cos(chip * 3) * 1.7,
              ),
            );
        }
      }
    },
    eject(position: Vec3, yaw: number) {
      const casing = shells[shell++ % shells.length]!;
      casing.age = 0.7;
      casing.mesh.visible = true;
      casing.mesh.position.set(
        position.x + Math.cos(yaw) * 0.3,
        position.y - 0.2,
        position.z - Math.sin(yaw) * 0.3,
      );
      casing.velocity.set(Math.cos(yaw) * 2.3, 1.5, -Math.sin(yaw) * 2.3);
    },
    update(dt: number) {
      for (const p of marks)
        if (p.age > 0) {
          p.age -= dt;
          p.mesh.visible = p.age > 0;
        }
      for (const collection of [chips, shells])
        for (const p of collection)
          if (p.age > 0) {
            p.age -= dt;
            p.mesh.visible = p.age > 0;
            p.velocity.y -= dt * 9;
            p.mesh.position.addScaledVector(p.velocity, dt);
            p.mesh.rotation.x += dt * 9;
            p.mesh.rotation.z += dt * 14;
          }
    },
    reset() {
      for (const collection of [marks, chips, shells])
        for (const p of collection) {
          p.age = 0;
          p.mesh.visible = false;
        }
    },
    dispose() {
      root.removeFromParent();
      [markGeo, chipGeo, shellGeo].forEach((g) => g.dispose());
      [markMat, chipMat, shellMat].forEach((m) => m.dispose());
    },
  };
}
