import * as THREE from 'three';
import { playerHeight } from '@fps/game-core';
import type { GameSnapshot, PlayerSnapshot, Vec3 } from '@fps/protocol';
import { isTeamMode } from '@fps/protocol';

export function isEnemy(
  snapshot: GameSnapshot,
  player: PlayerSnapshot,
  localId: string,
) {
  return (
    snapshot.phase === 'active' &&
    (snapshot.mode === 'arena' ||
      snapshot.mode === 'bots' ||
      isTeamMode(snapshot.mode)) &&
    player.id !== localId &&
    player.health > 0 &&
    player.ready &&
    player.connected &&
    (!isTeamMode(snapshot.mode) || (player.bot && !player.ally))
  );
}

export type VisibilityTest = (from: Vec3, to: Vec3) => boolean;

/** Reuse prediction's spatial index, not the decorative render triangles. */
export function createEnemyMarkers(
  scene: THREE.Scene,
  hasSight: VisibilityTest,
) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.moveTo(14, 18);
  ctx.lineTo(50, 18);
  ctx.lineTo(32, 43);
  ctx.closePath();
  ctx.strokeStyle = '#251717';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.fillStyle = '#ff8b70';
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const markers = new Map<string, { sprite: THREE.Sprite; seen: boolean }>();
  const head = new THREE.Vector3();
  const body = new THREE.Vector3();
  let nextCheck = 0;
  return {
    update(
      snapshot: GameSnapshot | undefined,
      localId: string,
      camera: THREE.PerspectiveCamera,
      active: boolean,
      time: number,
    ) {
      const candidates =
        snapshot && active
          ? snapshot.players.filter((p) => isEnemy(snapshot, p, localId))
          : [];
      const ids = new Set(candidates.map((p) => p.id));
      for (const [id, m] of markers)
        if (!ids.has(id)) {
          m.sprite.removeFromParent();
          markers.delete(id);
        }
      const check = time >= nextCheck;
      if (check) {
        nextCheck = time + 100;
      }
      let count = 0;
      for (const p of candidates) {
        let marker = markers.get(p.id);
        if (!marker) {
          const sprite = new THREE.Sprite(material);
          scene.add(sprite);
          marker = { sprite, seen: false };
          markers.set(p.id, marker);
        }
        head.set(
          p.position.x,
          p.position.y + playerHeight(p) - 0.12,
          p.position.z,
        );
        const distance = camera.position.distanceTo(head);
        if (check)
          marker.seen =
            distance < 55 &&
            (hasSight(camera.position, head) ||
              hasSight(camera.position, body.copy(head).setY(head.y - 0.6)));
        marker.sprite.position.copy(head).y += 0.45;
        marker.sprite.scale.setScalar(
          Math.max(
            0.22,
            distance *
              Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
              0.045,
          ),
        );
        marker.sprite.visible = marker.seen;
        if (marker.seen) count++;
      }
      return count;
    },
    reset() {
      for (const m of markers.values()) m.sprite.removeFromParent();
      markers.clear();
      nextCheck = 0;
    },
    dispose() {
      this.reset();
      texture.dispose();
      material.dispose();
    },
  };
}
