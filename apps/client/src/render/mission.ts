import * as THREE from 'three';
import type { GameSnapshot, MissionSnapshot } from '@fps/protocol';
import { MISSION, missionPoint } from '@fps/game-core';

/** Fixed geometry only: no particle emitters, dynamic lights or destruction. */
export function createMissionVisuals(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd176 });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x25454b,
    roughness: 0.7,
  });
  const green = new THREE.MeshBasicMaterial({ color: 0x80f4c7 });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd176,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.3, 2.5, 40),
    ringMaterial,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 1;
  root.add(ring);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const box = (
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
  };
  for (const stage of ['dispatch', 'deliver', 'switch'] as const) {
    const p = MISSION[stage].position;
    box(root, p.x, p.y + 0.45, p.z, 0.55, 0.8, 0.4, dark);
    box(root, p.x, p.y + 0.58, p.z + 0.21, 0.38, 0.25, 0.02, green);
  }
  const cargo = new THREE.Group();
  box(cargo, 0, 0.35, 0, 0.7, 0.6, 0.5, dark);
  box(cargo, 0, 0.4, 0.26, 0.5, 0.14, 0.02, gold);
  root.add(cargo);
  const beacons = new THREE.Group();
  for (const x of [-4.65, -1.35])
    box(beacons, x, 2.7, 14.05, 0.22, 0.18, 0.06, gold);
  root.add(beacons);
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0x665f5a,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const smokeGeometry = new THREE.IcosahedronGeometry(1, 1);
  const smoke = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, 12);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 12; i++) {
    dummy.position.set(-2 + Math.sin(i * 2) * 1.2, 7 + i * 1.1, -26);
    dummy.scale.set(1.5 + i * 0.2, 1.3 + i * 0.1, 1.8);
    dummy.updateMatrix();
    smoke.setMatrixAt(i, dummy.matrix);
  }
  root.add(smoke);
  let state: MissionSnapshot | undefined;
  let cinematicTime = 0;
  let cinematic = false;
  let blackout = false;
  return {
    snapshot(snapshot: GameSnapshot, localId = '') {
      root.visible = snapshot.mode === 'mission';
      state = root.visible ? snapshot.mission : undefined;
      cinematic = state?.stage === 'departing' || state?.stage === 'complete';
      blackout =
        !!state &&
        ['override', 'extract', 'departing', 'complete'].includes(state.stage);
      if (!state) {
        cinematicTime = 0;
        return;
      }
      cinematicTime =
        state.stage === 'complete'
          ? MISSION.departing.seconds
          : state.stage === 'departing'
            ? state.progress
            : 0;
      const target = missionPoint(state);
      ring.position.set(target.x, target.y + 0.025, target.z);
      ring.visible = !['idle', 'departing', 'complete', 'failed'].includes(
        state.stage,
      );
      ringMaterial.color.setHex(
        state.stage === 'extract' ? 0x80f4c7 : 0xffd176,
      );
      cargo.visible =
        state.stage === 'cell' ||
        (state.stage === 'deliver' && state.carrierId !== localId);
      cargo.position.set(state.cargo.x, state.cargo.y, state.cargo.z);
      if (state.stage === 'deliver') cargo.position.y += 0.9;
      smoke.visible = blackout;
    },
    frame(
      dt: number,
      camera: THREE.PerspectiveCamera,
      tram: THREE.Group,
      firstPerson: boolean,
      reducedMotion: boolean,
    ) {
      if (cinematic && state?.stage === 'departing')
        cinematicTime = Math.min(MISSION.departing.seconds, cinematicTime + dt);
      const t = cinematicTime / MISSION.departing.seconds;
      tram.position.z = cinematic ? 7 * t * t : 0;
      beacons.position.z = tram.position.z;
      if (cinematic && firstPerson) {
        camera.position.set(-12 + (reducedMotion ? 0 : t * 2), 5.5, 23 + t * 2);
        camera.lookAt(-3, 1.8, 9 + tram.position.z);
      }
      return { cinematic, blackout };
    },
    dispose() {
      root.removeFromParent();
      cube.dispose();
      ring.geometry.dispose();
      smokeGeometry.dispose();
      for (const material of [gold, dark, green, ringMaterial, smokeMaterial])
        material.dispose();
    },
  };
}
