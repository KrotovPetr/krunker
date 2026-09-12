import { isTeamMode } from '@fps/protocol';
import * as THREE from 'three';
import type { GameSnapshot, ServerEvent } from '@fps/protocol';

/** Fixed-size pools: two draw calls for all mines; no lights or physics bodies. */
export function createMineVisuals(scene: THREE.Scene) {
  const root = new THREE.Group();
  scene.add(root);
  const bodyGeo = new THREE.CylinderGeometry(0.24, 0.3, 0.12, 8);
  const lampGeo = new THREE.BoxGeometry(0.18, 0.045, 0.18);
  const blastGeo = new THREE.IcosahedronGeometry(1, 1);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x6f7950,
    roughness: 0.85,
  });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blastMat = new THREE.MeshBasicMaterial({
    color: 0xffb753,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    wireframe: true,
  });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, 16);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, 16);
  bodies.count = lamps.count = 0;
  bodies.frustumCulled = lamps.frustumCulled = false;
  root.add(bodies, lamps);
  const bursts = Array.from({ length: 8 }, () => {
    const mesh = new THREE.Mesh(blastGeo, blastMat);
    mesh.visible = false;
    root.add(mesh);
    return { mesh, age: 0 };
  });
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  let cursor = 0;
  return {
    snapshot(snapshot: GameSnapshot, localId: string) {
      bodies.count = lamps.count = Math.min(16, snapshot.mines.length);
      for (let i = 0; i < bodies.count; i++) {
        const mine = snapshot.mines[i]!;
        const owner = snapshot.players.find((p) => p.id === mine.ownerId);
        const friendly =
          mine.ownerId === localId ||
          (isTeamMode(snapshot.mode) && owner && (!owner.bot || owner.ally));
        transform.position.set(
          mine.position.x,
          mine.position.y,
          mine.position.z,
        );
        transform.updateMatrix();
        bodies.setMatrixAt(i, transform.matrix);
        transform.position.y += 0.08;
        transform.updateMatrix();
        lamps.setMatrixAt(i, transform.matrix);
        lamps.setColorAt(
          i,
          color.setHex(!mine.armed ? 0xffd77a : friendly ? 0x75e7d0 : 0xff6655),
        );
      }
      bodies.instanceMatrix.needsUpdate =
        lamps.instanceMatrix.needsUpdate = true;
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    },
    event(event: ServerEvent) {
      if (event.type !== 'explosion') return;
      const burst = bursts[cursor++ % bursts.length]!;
      burst.mesh.position.set(
        event.position.x,
        event.position.y,
        event.position.z,
      );
      burst.mesh.scale.setScalar(0.2);
      burst.mesh.visible = true;
      burst.age = 0.32;
    },
    update(dt: number) {
      for (const burst of bursts)
        if (burst.age > 0) {
          burst.age = Math.max(0, burst.age - dt);
          burst.mesh.visible = burst.age > 0;
          burst.mesh.scale.setScalar(0.2 + (1 - burst.age / 0.32) * 3.8);
        }
    },
    reset() {
      bodies.count = lamps.count = 0;
      for (const burst of bursts) {
        burst.age = 0;
        burst.mesh.visible = false;
      }
    },
    dispose() {
      root.removeFromParent();
      bodies.dispose();
      lamps.dispose();
      for (const resource of [
        bodyGeo,
        lampGeo,
        blastGeo,
        bodyMat,
        lampMat,
        blastMat,
      ])
        resource.dispose();
    },
  };
}
