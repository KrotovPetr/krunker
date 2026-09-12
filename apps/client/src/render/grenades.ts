import { isTeamMode } from '@fps/protocol';
import * as THREE from 'three';
import type { GameSnapshot } from '@fps/protocol';
/** One instanced draw for at most eight live grenades. */
export function createGrenadeVisuals(scene: THREE.Scene) {
  const geometry = new THREE.IcosahedronGeometry(0.16, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.7,
    emissive: 0x392715,
    emissiveIntensity: 0.2,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 8);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const transform = new THREE.Object3D(),
    color = new THREE.Color();
  return {
    snapshot(snapshot: GameSnapshot, localId: string) {
      mesh.count = Math.min(8, snapshot.grenades.length);
      for (let i = 0; i < mesh.count; i++) {
        const g = snapshot.grenades[i]!;
        const owner = snapshot.players.find((p) => p.id === g.ownerId);
        const friendly =
          g.ownerId === localId ||
          (isTeamMode(snapshot.mode) && owner && (!owner.bot || owner.ally));
        transform.position.set(g.position.x, g.position.y, g.position.z);
        transform.rotation.set(g.remaining * 4, g.remaining * 6, 0);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
        mesh.setColorAt(i, color.setHex(friendly ? 0x99c9a1 : 0xed9162));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    reset() {
      mesh.count = 0;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
