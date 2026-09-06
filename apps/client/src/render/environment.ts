import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rampVertices, RAMP_INDICES } from '@fps/game-core';
import type { MapDefinition } from '@fps/game-core';
import { addMapDetails } from './map-detail.js';

/** Owns the static geometry, materials and textures of exactly one map. */
export function createEnvironment(map: MapDefinition) {
  const root = new THREE.Group();
  const textures: THREE.Texture[] = [];
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const disposeSigns = addMapDetails(root, map);
  const finish = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    matrix: THREE.Matrix4,
  ) => {
    geometry.applyMatrix4(matrix);
    const list = batches.get(material) ?? [];
    list.push(geometry);
    batches.set(material, list);
  };
  const transform = (x: number, y: number, z: number, yaw = 0) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(1, 1, 1),
    );
  const textureFor = (surface: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = surface === 'asphalt' ? '#c4c6c5' : '#eeede7';
    ctx.fillRect(0, 0, 256, 256);
    let seed = 713;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 5000; i++) {
      const shade = Math.floor(100 + random() * 130);
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${surface === 'asphalt' ? 0.22 : 0.09})`;
      ctx.fillRect(
        random() * 256,
        random() * 256,
        1 + random() * 2,
        1 + random() * 2,
      );
    }
    if (surface === 'paving' || surface === 'stone' || surface === 'roof') {
      const rows = surface === 'roof' ? 8 : 4,
        height = 256 / rows;
      ctx.strokeStyle = '#a5a89f';
      ctx.lineWidth = surface === 'roof' ? 3 : 1.5;
      for (let y = 0; y < 256; y += height) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
        for (let x = ((y / height) % 2) * 64; x < 256; x += 128) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + height);
          ctx.stroke();
        }
      }
    }
    if (surface === 'metal') {
      ctx.strokeStyle = '#b3b9b5';
      for (let x = 0; x < 256; x += 64) {
        ctx.strokeRect(x, 0, 64, 256);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    textures.push(texture);
    return texture;
  };
  const surfaceTextures = new Map<string, THREE.Texture>();
  const material = (color: number, surface = 'plain') => {
    const key = `${color}:${surface}`;
    if (!materials.has(key)) {
      let texture: THREE.Texture | undefined;
      if (surface !== 'plain') {
        texture = surfaceTextures.get(surface);
        if (!texture) {
          texture = textureFor(surface);
          surfaceTextures.set(surface, texture);
        }
      }
      materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: surface === 'metal' ? 0.62 : 0.92,
          metalness: surface === 'metal' ? 0.15 : 0,
          map: texture ?? null,
        }),
      );
    }
    return materials.get(key)!;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    surface = 'plain',
    yaw = 0,
  ) => {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    const uv = geometry.getAttribute('uv'),
      position = geometry.getAttribute('position'),
      normal = geometry.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(normal.getX(i)),
        ny = Math.abs(normal.getY(i));
      uv.setXY(
        i,
        (nx > 0.5 ? position.getZ(i) : position.getX(i)) / 2,
        (ny > 0.5 ? position.getZ(i) : position.getY(i)) / 2,
      );
    }
    finish(geometry, material(color, surface), transform(x, y, z, yaw));
  };
  for (const supply of map.supplies ?? []) {
    box(
      supply.x,
      supply.y - 0.18,
      supply.z,
      0.96,
      0.04,
      0.7,
      0x9cdbaf,
      'metal',
    );
    for (const offset of [-0.2, 0, 0.2])
      box(
        supply.x + offset,
        supply.y - 0.12,
        supply.z,
        0.07,
        0.12,
        0.3,
        0xf3d79a,
        'metal',
      );
  }
  for (const block of map.blocks) {
    const { position: p, size: s } = block;
    if (block.shape === 'ramp') {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(rampVertices(s), 3),
      );
      geometry.setIndex(RAMP_INDICES);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material(block.color));
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.y = block.yaw;
      mesh.receiveShadow = mesh.castShadow = true;
      root.add(mesh);
    } else
      box(
        p.x,
        p.y,
        p.z,
        s.x,
        s.y,
        s.z,
        block.color,
        block.surface ?? (block.id === 'floor' ? 'paving' : 'plaster'),
        block.yaw,
      );
  }
  const cylinder = (
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    color: number,
    top = radius,
  ) =>
    finish(
      new THREE.CylinderGeometry(top, radius, height, 8),
      material(color),
      transform(x, y, z),
    );
  const foliage = (
    x: number,
    y: number,
    z: number,
    size: number,
    color: number,
  ) => {
    const g = new THREE.IcosahedronGeometry(size, 0);
    g.scale(1, 0.8, 1);
    finish(g, material(color), transform(x, y, z));
  };
  // Flush facade details cannot create invisible obstacles or cover a real aperture.
  const window = (
    x: number,
    y: number,
    z: number,
    yaw: number,
    width = 1.4,
    height = 1.8,
  ) => {
    const base = transform(x, y, z, yaw);
    const part = (
      dx: number,
      dy: number,
      dz: number,
      sx: number,
      sy: number,
      sz: number,
      color: number,
    ) =>
      finish(
        new THREE.BoxGeometry(sx, sy, sz),
        material(color),
        base.clone().multiply(new THREE.Matrix4().makeTranslation(dx, dy, dz)),
      );
    part(0, 0, 0, width + 0.24, height + 0.24, 0.08, 0xe5dfce);
    part(0, 0, 0.055, width, height, 0.045, 0x384f59);
    part(
      -width * 0.2,
      height * 0.12,
      0.082,
      width * 0.34,
      height * 0.65,
      0.015,
      0x6c8c91,
    );
    part(0, 0, 0.1, 0.06, height, 0.04, 0xb1bdb6);
    part(0, -0.1, 0.1, width, 0.06, 0.04, 0xb1bdb6);
    part(0, -height / 2 - 0.12, 0.12, width + 0.4, 0.14, 0.3, 0xe9dfca);
    for (const side of [-1, 1])
      part(side * (width / 2 + 0.22), 0, 0.025, 0.24, height, 0.08, 0x5a7973);
  };
  if (map.id === 'bastion') {
    const houses = map.blocks.filter(
      (b) => b.id.startsWith('house-') || b.id.endsWith('-boundary'),
    );
    for (const house of houses) {
      const { x, y, z } = house.position,
        { x: width, y: height, z: depth } = house.size;
      const sideFacade = Math.abs(x) > 20;
      const length = sideFacade ? depth : width;
      const yaw = sideFacade
        ? x < 0
          ? Math.PI / 2
          : -Math.PI / 2
        : z < 0
          ? 0
          : Math.PI;
      const face = sideFacade
        ? x - (Math.sign(x) * width) / 2
        : z - (Math.sign(z) * depth) / 2;
      for (let row = 0; row < Math.floor(height / 3); row++)
        for (let u = -length / 2 + 1.8; u < length / 2 - 1; u += 3.2)
          window(
            sideFacade ? face : x + u,
            y - height / 2 + 2 + row * 3,
            sideFacade ? z + u : face,
            yaw,
            1.3,
            row === 0 ? 1.8 : 1.65,
          );
      // Continuous cornices and a contrasting ground-floor fascia.
      if (sideFacade) {
        box(face, 3.35, z, 0.15, 0.18, length, 0xe3d9c4);
        box(face, 0.35, z, 0.15, 0.6, length, 0x838d87, 'stone');
      } else {
        box(x, 3.35, face, length, 0.18, 0.15, 0xe3d9c4);
        box(x, 0.35, face, length, 0.6, 0.15, 0x838d87, 'stone');
      }
    }
    // Civic facade pilasters, window reveals and roof edging.
    for (const side of [-1, 1]) {
      for (const x of [-8.7, -3.1, 3.1, 8.7]) {
        box(x, 2.28, side * 8.33, 0.36, 4.45, 0.16, 0xeee3cb, 'stone');
        box(x, 4.35, side * 8.39, 0.65, 0.22, 0.25, 0xe3d8c0);
      }
      box(0, 4.48, side * 8.37, 18.6, 0.17, 0.22, 0xb2a890);
      for (const x of [-5.3, 5.3])
        box(x, 1.23, side * 8.33, 3.6, 0.1, 0.22, 0xeae3d1);
      for (const z of [-5, 5])
        box(side * 9.32, 1.23, z, 0.2, 0.1, 2.6, 0xeae3d1);
      // Thin floor inlays lead into the building.
      for (let z = 10; z < 16; z += 1.8)
        box(side * 1.8, 0.016, z, 0.12, 0.02, 0.9, 0xded2a9);
    }
    // Street lamps stand inside existing planter collision volumes.
    for (const planter of map.blocks.filter((b) =>
      b.id.startsWith('street-planter'),
    )) {
      const { x, z } = planter.position;
      box(x, 1.05, z, 2.8, 0.05, 1.4, 0x54584a);
      foliage(x - 0.8, 1.25, z, 0.48, 0x667d5c);
      foliage(x, 1.3, z, 0.5, 0x7d925f);
      foliage(x + 0.8, 1.25, z, 0.45, 0x536c59);
      cylinder(x, 2.55, z, 0.07, 3.1, 0x37494b);
      box(x + 0.3, 4.12, z, 0.7, 0.1, 0.12, 0x37494b);
      box(x + 0.55, 4.02, z, 0.4, 0.16, 0.35, 0xf0d89f);
    }
    for (const planter of map.blocks.filter((b) =>
      b.id.startsWith('atrium-planter'),
    )) {
      foliage(planter.position.x, 1.15, planter.position.z, 0.55, 0x6c835f);
    }
    // Cafe fabric canopy and civic banners are above the standing player.
    box(-20.05, 3.6, 13, 0.9, 0.12, 8, 0x537e76);
    for (let z = 9.5; z < 17; z += 1)
      box(-20.05, 3.67, z, 0.92, 0.02, 0.32, 0xe0d6b9);
    box(-15.7, 1.7, 1.13, 2.7, 1.5, 0.04, 0x243e47);
    box(-15.7, 0.65, 1.14, 2.7, 0.12, 0.15, 0xded4bd);
    for (let x = -1; x <= 1; x += 0.5)
      box(-15.7 + x, 1.7, 1.17, 0.04, 1.5, 0.03, 0xbdc6b7);
    // Van details follow the actual body dimensions.
    box(17.5, 1.9, 1.23, 1.95, 0.64, 0.03, 0x34515a);
    for (const side of [-1, 1]) {
      box(17.5 + side * 1.16, 1.9, 2, 0.04, 0.64, 1.3, 0x34515a);
      for (const z of [2.2, 5.4]) {
        const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.15, 12);
        wheel.rotateZ(Math.PI / 2);
        finish(
          wheel,
          material(0x253033),
          transform(17.5 + side * 1.17, 0.43, z),
        );
      }
    }
    cylinder(-7.8, 1.05, 14.4, 0.5, 0.1, 0x6ba3a4);
    cylinder(-7.8, 1.45, 14.4, 0.16, 0.8, 0xcac0a7);
    // Road crossings and center dashes, raised only a fraction above the asphalt.
    for (const side of [-1, 1]) {
      for (let z = -16; z <= 16; z += 4)
        if (Math.abs(z - 4) > 3 || side < 0)
          box(side * 18.5, 0.014, z, 0.12, 0.02, 1.6, 0xd8cfab);
      for (let x = -3; x <= 3; x++)
        box(x * 0.85, 0.02, side * 12, 0.4, 0.02, 2.4, 0xe7decb);
    }
  } else if (map.id === 'sandgate') {
    // Perimeter facades give the courtyards a skyline and readable scale.
    for (const side of [-1, 1]) {
      box(0, 0.45, side * 28.01, 64, 0.9, 0.12, 0xa48e70, 'stone');
      box(0, 7.7, side * 28.01, 64, 0.25, 0.2, 0xe5d3b0, 'stone');
      box(side * 32.01, 0.45, 0, 0.12, 0.9, 56, 0xa48e70, 'stone');
      box(side * 32.01, 7.7, 0, 0.2, 0.25, 56, 0xe5d3b0, 'stone');
      for (let u = -24; u <= 24; u += 6) {
        window(u, 5.6, side * 27.98, side < 0 ? 0 : Math.PI, 1, 1.7);
        box(u + 2.8, 4, side * 28.01, 0.3, 8, 0.14, 0xddc8a3, 'stone');
      }
      for (let u = -20; u <= 20; u += 6) {
        window(
          side * 31.98,
          5.6,
          u,
          side < 0 ? Math.PI / 2 : -Math.PI / 2,
          1,
          1.7,
        );
        box(side * 32.01, 4, u + 2.8, 0.14, 8, 0.3, 0xddc8a3, 'stone');
      }
    }
    for (const house of map.blocks.filter((b) => b.id.startsWith('house-'))) {
      const p = house.position,
        s = house.size;
      for (const side of [-1, 1]) {
        for (let z = -s.z / 2 + 2; z < s.z / 2 - 1; z += 3.5)
          window(
            p.x + side * (s.x / 2 + 0.045),
            4.3,
            p.z + z,
            (side * Math.PI) / 2,
            0.9,
            1.4,
          );
        for (let x = -s.x / 2 + 1.5; x < s.x / 2 - 1; x += 3)
          window(
            p.x + x,
            4.3,
            p.z + side * (s.z / 2 + 0.045),
            side === 1 ? 0 : Math.PI,
            0.9,
            1.4,
          );
        box(p.x + (side * s.x) / 2, 0.5, p.z, 0.12, 1, s.z, 0x968265, 'stone');
      }
      // Roof trim and vents belong to the inaccessible building silhouettes.
      for (let z = -s.z / 2 + 0.4; z < s.z / 2; z += 1.4)
        box(
          p.x - s.x / 2 + 0.15,
          s.y + 0.35,
          p.z + z,
          0.5,
          0.55,
          0.7,
          0xe5d3b0,
          'stone',
        );
      box(p.x, s.y + 0.5, p.z, 1.4, 0.8, 1.4, 0xa48b6d, 'stone');
    }
    // Recessed-looking sandstone bands frame each real opening.
    for (const [x, z, width] of [
      [-20, -8, 4],
      [0, -7, 4],
      [21, 11, 6],
    ] as const) {
      for (const side of [-1, 1])
        for (let y = 0.4; y < 3.3; y += 0.65)
          box(
            x + side * (width / 2 + 0.17),
            y,
            z + 0.44,
            0.34,
            0.56,
            0.16,
            0xe4d2ae,
            'stone',
          );
    }
    // Fabric strips above the tunnels keep their entrance distinct from long A.
    for (let x = -26; x < -13; x += 1)
      box(x, 3.83, 12, 0.65, 0.025, 4, Math.round(x) % 2 ? 0x527e80 : 0xd5c3a0);
    for (const [x, color] of [
      [20, 0xc9874f],
      [-20, 0x5f9399],
    ] as const) {
      for (const side of [-1, 1]) {
        box(x + side * 5.5, 0.095, -17, 0.12, 0.02, 10, color);
        box(x, 0.095, -17 + side * 5, 11, 0.02, 0.12, color);
      }
    }
    for (const crate of map.blocks.filter(
      (b) => b.id.includes('crate') || b.id === 'spawn-cart',
    )) {
      const p = crate.position,
        s = crate.size;
      for (const side of [-1, 1]) {
        box(
          p.x,
          p.y,
          p.z + side * (s.z / 2 + 0.015),
          s.x,
          0.12,
          0.025,
          0x55594e,
        );
        box(
          p.x + side * s.x * 0.36,
          p.y,
          p.z + s.z / 2 + 0.02,
          0.1,
          s.y,
          0.025,
          0x55594e,
        );
      }
    }
  } else {
    // Industrial cladding: ribs, roof fascia and panel seams keep the training geometry readable.
    for (const block of map.blocks.filter((b) => b.id.endsWith('-back'))) {
      const sign = Math.sign(block.position.z);
      for (let x = -11; x <= 11; x += 2)
        box(x, 4.6, block.position.z - sign * 0.31, 0.06, 3, 0.04, 0x526a6b);
      box(0, 6.18, block.position.z - sign * 3, 24.3, 0.15, 6.5, 0x344b50);
      for (const x of [-9, -5, 5, 9]) {
        // Pipe fittings sit against existing solids, outside the walking routes.
        cylinder(
          x,
          4.6,
          block.position.z - sign * 0.34,
          0.12,
          2.5,
          sign < 0 ? 0xb88456 : 0x5b9d9e,
        );
        box(
          x,
          5.5,
          block.position.z - sign * 0.42,
          0.4,
          0.18,
          0.16,
          0xc0b994,
          'metal',
        );
      }
    }
    for (const block of map.blocks.filter(
      (b) =>
        b.id.startsWith('cover-') ||
        b.id.includes('jump-') ||
        b.id.includes('service-cover'),
    )) {
      const { position: p, size: s } = block;
      for (const sign of [-1, 1])
        box(
          p.x,
          p.y,
          p.z + sign * (s.z / 2 + 0.008),
          s.x * 0.85,
          0.09,
          0.016,
          0x4b6261,
        );
    }
  }
  for (const [mat, geometries] of batches) {
    // Normals, UVs and indices differ between primitive kinds; normalize before merging.
    const normalized = geometries.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      if (!n.getAttribute('uv'))
        n.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(
            new Float32Array(n.getAttribute('position').count * 2),
            2,
          ),
        );
      return n;
    });
    const merged = mergeGeometries(normalized, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    }
    for (const g of new Set([...geometries, ...normalized])) g.dispose();
  }
  return {
    root,
    dispose() {
      disposeSigns();
      textures.forEach((t) => t.dispose());
      const geometries = new Set<THREE.BufferGeometry>(),
        mats = new Set<THREE.Material>(materials.values());
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          geometries.add(o.geometry);
          for (const m of [o.material].flat()) mats.add(m);
        }
      });
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      root.removeFromParent();
    },
  };
}
