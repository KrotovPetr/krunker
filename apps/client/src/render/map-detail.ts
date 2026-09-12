import * as THREE from 'three';
import type { MapDefinition } from '@fps/game-core';

/** Visual markings only; every solid is defined in ARENA.blocks. */
export function addMapDetails(
  scene: THREE.Object3D,
  map: MapDefinition,
  fullDetails = true,
) {
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
  if (map.id !== 'switchyard' || !fullDetails)
    return () => textures.forEach((texture) => texture.dispose());
  const amber = new THREE.MeshBasicMaterial({ color: 0xd5a063 }),
    teal = new THREE.MeshBasicMaterial({ color: 0x7bc8bd });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const markings = [
    { material: amber, z: -10.2, x: -20.5 },
    { material: teal, z: 10.2, x: 20.5 },
  ];
  for (const marking of markings) {
    const transforms: { x: number; z: number; width: number; depth: number }[] =
      [];
    for (let x = -19; x <= 19; x += 3)
      transforms.push({ x, z: marking.z, width: 1.8, depth: 0.12 });
    for (let z = -10; z <= 10; z += 3)
      transforms.push({ x: marking.x, z, width: 0.12, depth: 1.8 });
    const stripes = new THREE.InstancedMesh(
      geometry,
      marking.material,
      transforms.length,
    );
    const transform = new THREE.Object3D();
    transforms.forEach((item, i) => {
      transform.position.set(item.x, 0.018, item.z);
      transform.rotation.set(-Math.PI / 2, 0, 0);
      transform.scale.set(item.width, item.depth, 1);
      transform.updateMatrix();
      stripes.setMatrixAt(i, transform.matrix);
    });
    stripes.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    scene.add(stripes);
  }
  return () => textures.forEach((texture) => texture.dispose());
}
