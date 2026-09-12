import * as THREE from 'three';
import { getMap } from '@fps/game-core';
import { isTeamMode, type GameSnapshot } from '@fps/protocol';

/** Three fixed meshes, no lights, colliders, per-frame allocation or through-wall overlay. */
export function createControlVisuals(scene: THREE.Scene) {
  const geometry = new THREE.RingGeometry(0.96, 1, 48);
  const centerGeometry = new THREE.RingGeometry(0.25, 0.4, 24);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd78a,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const orderMaterial = new THREE.MeshBasicMaterial({
    color: 0x9de1ff,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geometry, material);
  const center = new THREE.Mesh(centerGeometry, material);
  const order = new THREE.Mesh(geometry, orderMaterial);
  for (const mesh of [ring, center, order]) {
    // Draw decals after opaque map surfaces without showing them through walls.
    mesh.renderOrder = 1;
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
  }
  return {
    snapshot(snapshot: GameSnapshot) {
      const point = getMap(snapshot.mapId).control;
      ring.visible = center.visible = snapshot.mode === 'control' && !!point;
      if (point) {
        ring.position.set(
          point.position.x,
          point.position.y + 0.02,
          point.position.z,
        );
        center.position.copy(ring.position);
        ring.scale.setScalar(point.radius);
        material.color.setHex(
          snapshot.control?.contested
            ? 0xffd78a
            : snapshot.control?.owner === 'allies'
              ? 0x75e7d0
              : snapshot.control?.owner === 'enemies'
                ? 0xff806d
                : 0xfff0bb,
        );
      }
      const command = snapshot.squadOrder;
      order.visible =
        isTeamMode(snapshot.mode) && !!command && command.kind !== 'auto';
      if (command)
        order.position.set(
          command.position.x,
          command.position.y + 0.025,
          command.position.z,
        );
    },
    dispose() {
      for (const mesh of [ring, center, order]) mesh.removeFromParent();
      geometry.dispose();
      centerGeometry.dispose();
      material.dispose();
      orderMaterial.dispose();
    },
  };
}
