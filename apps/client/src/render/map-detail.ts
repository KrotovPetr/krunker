import * as THREE from 'three';
import type { MapDefinition } from '@fps/game-core';

/** Visual markings only; every solid is defined in ARENA.blocks. */
export function addMapDetails(scene: THREE.Object3D, map: MapDefinition) {
  const textures: THREE.Texture[] = [];
  for (const landmark of map.landmarks ?? []) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#1a2b2f';
    ctx.fillRect(0, 0, 768, 128);
    ctx.fillStyle = `#${landmark.color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 14, 128);
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(landmark.text, 384, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(
        landmark.text === 'ROOFTOP' ? 2.6 : landmark.text === 'RANGE' ? 4 : 5.5,
        landmark.text === '03 / UNDERPASS' || landmark.text === 'ROOFTOP'
          ? 0.5
          : 0.9,
      ),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    mesh.position.set(
      landmark.position.x,
      landmark.position.y,
      landmark.position.z,
    );
    mesh.rotation.y = landmark.yaw;
    scene.add(mesh);
  }
  if (map.id !== 'switchyard')
    return () => textures.forEach((texture) => texture.dispose());
  const amber = new THREE.MeshBasicMaterial({ color: 0xd5a063 }),
    teal = new THREE.MeshBasicMaterial({ color: 0x7bc8bd });
  for (const z of [-10.2, 10.2]) {
    for (let x = -19; x <= 19; x += 3) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.12),
        z < 0 ? amber : teal,
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.018, z);
      scene.add(stripe);
    }
  }
  for (const x of [-20.5, 20.5]) {
    for (let z = -10; z <= 10; z += 3) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 1.8),
        x < 0 ? amber : teal,
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.018, z);
      scene.add(stripe);
    }
  }
  return () => textures.forEach((texture) => texture.dispose());
}
