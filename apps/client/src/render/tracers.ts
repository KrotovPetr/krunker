import * as THREE from 'three';
import type { ServerEvent } from '@fps/protocol';

/** One reusable GPU buffer and one draw call, including shotgun volleys. */
export function createTracers(scene: THREE.Scene) {
  const capacity = 64;
  const positions = new Float32Array(capacity * 6);
  const colors = new Float32Array(capacity * 6);
  const remaining = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  const color = new THREE.BufferAttribute(colors, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);
  const tint = new THREE.Color();
  let cursor = 0;
  return {
    event(event: ServerEvent, localId: string) {
      if (event.type !== 'shot' || event.weapon === 'knife') return;
      tint.setHex(event.playerId === localId ? 0xffd08a : 0xffffff);
      for (const end of event.ends) {
        const index = cursor++ % capacity,
          offset = index * 6;
        positions.set(
          [event.origin.x, event.origin.y, event.origin.z, end.x, end.y, end.z],
          offset,
        );
        colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], offset);
        remaining[index] = 0.065;
      }
      position.needsUpdate = color.needsUpdate = true;
      lines.visible = true;
    },
    update(dt: number) {
      let active = false,
        changed = false;
      for (let i = 0; i < capacity; i++)
        if (remaining[i]! > 0) {
          remaining[i] = Math.max(0, remaining[i]! - dt);
          if (remaining[i]! > 0) active = true;
          else {
            positions.fill(0, i * 6, i * 6 + 6);
            changed = true;
          }
        }
      lines.visible = active;
      if (changed) position.needsUpdate = true;
    },
    reset() {
      remaining.fill(0);
      positions.fill(0);
      position.needsUpdate = true;
      lines.visible = false;
    },
    dispose() {
      lines.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
