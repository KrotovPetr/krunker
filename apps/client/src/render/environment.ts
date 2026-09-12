import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rampVertices, RAMP_INDICES, mapLocalPoint } from '@fps/game-core';
import type { MapDefinition } from '@fps/game-core';
import { addMapDetails } from './map-detail.js';

/** Owns the static geometry, materials and textures of exactly one map. */
export function createEnvironment(
  map: MapDefinition,
  mapDetails: 'reduced' | 'full' = 'full',
) {
  const root = new THREE.Group();
  const tramRoot = new THREE.Group();
  root.add(tramRoot);
  const textures: THREE.Texture[] = [];
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const tramBatches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  let renderingTram = false;
  const disposeSigns = addMapDetails(root, map, mapDetails === 'full');
  const finish = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    matrix: THREE.Matrix4,
  ) => {
    geometry.applyMatrix4(matrix);
    const target = renderingTram ? tramBatches : batches;
    const list = target.get(material) ?? [];
    list.push(geometry);
    target.set(material, list);
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
    if (surface === 'concrete') {
      // Baked weathering: generated once, with no extra meshes or frame work.
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(71,65,53,${0.025 + random() * 0.055})`;
        ctx.fillRect(
          random() * 256,
          random() * 256,
          8 + random() * 55,
          4 + random() * 32,
        );
      }
      ctx.strokeStyle = 'rgba(70,66,58,0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, 256, 128);
      ctx.strokeRect(0, 128, 128, 128);
      for (const x of [12, 116, 140, 244]) {
        for (const y of [12, 116, 140, 244]) {
          ctx.fillStyle = 'rgba(63,59,51,0.32)';
          ctx.fillRect(x, y, 2, 2);
        }
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
    renderingTram = ['tram-body', 'tram-cabin', 'tram-roof'].includes(block.id);
    // Medical crates use a white case and green plus, distinct from ammo rounds.
    if (block.id.startsWith('medkit-')) {
      const p = block.position;
      box(p.x, p.y + 0.22, p.z, 0.7, 0.025, 0.48, 0x40866d, 'metal');
      box(p.x, p.y + 0.24, p.z, 0.38, 0.015, 0.1, 0xf4f4df);
      box(p.x, p.y + 0.24, p.z, 0.1, 0.015, 0.32, 0xf4f4df);
      for (const side of [-1, 1]) {
        box(p.x, p.y, p.z + side * 0.33, 0.36, 0.09, 0.018, 0x40866d);
        box(p.x, p.y, p.z + side * 0.33, 0.09, 0.28, 0.018, 0x40866d);
      }
    }
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
  renderingTram = false;
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
    // Structural silhouettes are shared by both quality profiles. Windows and
    // fittings attach to current solids, never to coordinates from the old map.
    if (mapDetails === 'full') {
      for (const house of map.blocks.filter(
        (b) => b.id.startsWith('house-') || b.id.endsWith('-boundary'),
      )) {
        const { x, y, z } = house.position,
          s = house.size;
        const sideFacade = Math.abs(x) > 20;
        const length = sideFacade ? s.z : s.x;
        const yaw = sideFacade
          ? x < 0
            ? Math.PI / 2
            : -Math.PI / 2
          : z < 0
            ? 0
            : Math.PI;
        const face = sideFacade
          ? x - (Math.sign(x) * s.x) / 2
          : z - (Math.sign(z) * s.z) / 2;
        for (let row = 0; row < Math.floor(s.y / 3); row++)
          for (let u = -length / 2 + 1.8; u < length / 2 - 1; u += 3.2)
            window(
              sideFacade ? face : x + u,
              y - s.y / 2 + 2 + row * 3,
              sideFacade ? z + u : face,
              yaw,
              1.3,
              1.6,
            );
      }
      for (const wall of map.blocks.filter((b) => b.id.endsWith('-lintel'))) {
        const p = wall.position,
          s = wall.size;
        box(
          p.x,
          p.y + 0.15,
          p.z,
          s.x + 0.12,
          0.15,
          s.z + 0.12,
          0xe3d4b8,
          'stone',
        );
      }
    }
    const tram = map.blocks.find((b) => b.id === 'tram-cabin')!;
    for (const side of [-1, 1]) {
      renderingTram = true;
      for (const z of [5.4, 7.8, 10.2, 12.6]) {
        box(
          tram.position.x + side * 1.76,
          2.2,
          z,
          0.025,
          0.8,
          1.9,
          0x314b53,
          'metal',
        );
        if (mapDetails === 'full')
          box(
            tram.position.x + side * 1.78,
            2.2,
            z,
            0.03,
            0.8,
            0.05,
            0xd9c9a8,
            'metal',
          );
      }
      box(
        tram.position.x,
        2.2,
        9 + side * 4.86,
        2.9,
        0.8,
        0.025,
        0x314b53,
        'metal',
      );
      renderingTram = false;
      box(-3 + side * 1.2, 0.136, 9, 0.09, 0.018, 24, 0x9a9d96, 'metal');
      renderingTram = true;
      for (const z of [5.5, 12.5]) {
        const wheel = new THREE.CylinderGeometry(0.45, 0.45, 0.15, 10);
        wheel.rotateZ(Math.PI / 2);
        finish(wheel, material(0x253033), transform(-3 + side * 1.72, 0.5, z));
      }
      // Rail tops align with solid gallery curbs; no extra colliders.
      renderingTram = false;
      box(0, 4.95, -5 + side * 1.85, 20, 0.07, 0.07, 0xc59660, 'metal');
      for (let x = -9; x <= 9; x += 3)
        box(x, 4.65, -5 + side * 1.85, 0.07, 0.6, 0.07, 0xc59660, 'metal');
    }
    // Office trim and awning stripes keep the warm depot / teal station readable.
    for (const office of map.blocks.filter((b) => b.id.endsWith('-office'))) {
      const p = office.position,
        s = office.size;
      box(
        p.x,
        p.y + s.y / 2 - 0.25,
        p.z,
        s.x + 0.12,
        0.18,
        s.z + 0.12,
        0xe3d4b8,
        'stone',
      );
    }
    for (const canopy of map.blocks.filter(
      (b) => b.id === 'market-awning' || b.id === 'tram-stop-canopy',
    )) {
      for (let x = -canopy.size.x / 2 + 0.3; x < canopy.size.x / 2; x += 0.8)
        box(
          canopy.position.x + x,
          canopy.position.y + 0.11,
          canopy.position.z,
          0.25,
          0.02,
          canopy.size.z,
          0xe3d4b8,
          'metal',
        );
    }
    if (mapDetails === 'full') {
      const planter = map.blocks.find((b) => b.id === 'square-planter')!;
      for (const dx of [-1.1, 0, 1.1])
        foliage(
          planter.position.x + dx,
          1.3,
          planter.position.z,
          0.5,
          0x667d5c,
        );
    }
  } else if (map.id === 'sandgate') {
    // Static water in a solid shallow basin. No reflection pass or particles.
    box(0, 0.915, 0, 4.7, 0.025, 4.7, 0x538d8a, 'metal');
    for (const side of [-1, 1]) {
      box(side * 2.5, 0.92, 0, 0.2, 0.04, 5.2, 0xe7d7b5, 'stone');
      box(0, 0.92, side * 2.5, 5.2, 0.04, 0.2, 0xe7d7b5, 'stone');
    }
    // Market stripes follow the real roof, including the reduced profile.
    for (let x = -26.5, i = 0; x <= -11.5; x += 1, i++)
      box(x, 3.39, 0, 0.7, 0.015, 23.5, i % 2 ? 0x497f7f : 0xdac6a0, 'roof');
    for (const b of map.blocks.filter((b) =>
      b.id.startsWith('market-stall-'),
    )) {
      const p = b.position,
        s = b.size;
      box(p.x, p.y + s.y / 2 + 0.015, p.z, s.x, 0.025, s.z, 0xe7d7b5, 'stone');
      if (mapDetails === 'full')
        for (const dx of [-1, 0, 1])
          box(
            p.x + dx,
            p.y,
            p.z + s.z / 2 + 0.015,
            0.075,
            s.y,
            0.025,
            0x364d49,
            'metal',
          );
    }
    // Ground inlays mark connections, not extra collision obstacles.
    for (const z of [-10, 10])
      box(0, 0.015, z, 18, 0.02, 0.16, 0xd5bc92, 'paving');
    if (mapDetails === 'full') {
      for (const side of [-1, 1]) {
        box(0, 0.45, side * 28.01, 64, 0.9, 0.1, 0xa48e70, 'stone');
        box(0, 7.7, side * 28.01, 64, 0.25, 0.16, 0xe5d3b0, 'stone');
        box(side * 32.01, 0.45, 0, 0.1, 0.9, 56, 0xa48e70, 'stone');
        for (let u = -24; u <= 24; u += 8)
          window(u, 5.6, side * 27.98, side < 0 ? 0 : Math.PI, 1, 1.7);
      }
      for (const house of map.blocks.filter((b) => b.id.startsWith('house-'))) {
        const p = house.position,
          s = house.size,
          windowY = p.y + 0.65;
        for (const side of [-1, 1]) {
          for (let z = -s.z / 2 + 1.5; z < s.z / 2 - 1; z += 3)
            window(
              p.x + side * (s.x / 2 + 0.025),
              windowY,
              p.z + z,
              (side * Math.PI) / 2,
              0.8,
              1.25,
            );
          for (let x = -s.x / 2 + 1.5; x < s.x / 2 - 1; x += 3)
            window(
              p.x + x,
              windowY,
              p.z + side * (s.z / 2 + 0.025),
              side === 1 ? 0 : Math.PI,
              0.8,
              1.25,
            );
        }
        box(p.x, p.y + s.y / 2 + 0.45, p.z, 1.3, 0.6, 1.3, 0xa48b6d, 'stone');
      }
      // Bronze bands emphasize the real gate posts without filling the doorway.
      for (const x of [-8, -12])
        for (const y of [0.6, 1.6, 2.6, 3.6])
          box(x, y, -13.48, 1, 0.12, 0.04, 0xb18b54, 'metal');
    }
  } else if (map.id === 'spillway') {
    // Silhouette pieces exist in both profiles; only small fittings are optional.
    const bridge = map.blocks.find((b) => b.id === 'bridge-deck')!;
    const bridgeYaw = bridge.yaw,
      bridgeLength = bridge.size.x,
      orange = 0xb96537,
      deepTeal = 0x294c50,
      concreteEdge = 0xd0c4aa;
    const bridgePoint = (along: number, side: number) =>
      mapLocalPoint(bridge, along, 0, side);

    // Five dark intake gates and heavy concrete frames create the dam facade
    // seen from almost every lower route.
    for (const x of [-29, -21, -13, -5, 3]) {
      box(x, 2.8, -14.99, 5.8, 5.1, 0.08, 0x243b3f, 'metal');
      for (const seam of mapDetails === 'full' ? [-1.8, 0, 1.8] : [])
        box(x + seam, 3.25, -14.93, 0.08, 4.5, 0.06, 0x718889, 'metal');
      box(x, 5.58, -14.9, 6.2, 0.22, 0.18, concreteEdge, 'stone');
    }
    for (const x of [-33, -25, -17, -9, -1, 7]) {
      box(x, 6.35, -14.4, 1.6, 0.2, 1.8, concreteEdge, 'concrete');
    }

    // Orange maintenance railings remain visual only and sit on the existing
    // bridge curbs. All pieces merge into one material batch.
    for (const side of [-1, 1]) {
      const center = bridgePoint(0, side * 2.85);
      box(
        center.x,
        4.18,
        center.z,
        bridgeLength,
        0.09,
        0.09,
        orange,
        'metal',
        bridgeYaw,
      );
      box(
        center.x,
        4.62,
        center.z,
        bridgeLength,
        0.09,
        0.09,
        orange,
        'metal',
        bridgeYaw,
      );
      for (let along = -21; along <= 21; along += 3) {
        const point = bridgePoint(along, side * 2.85);
        box(point.x, 4.18, point.z, 0.09, 1.5, 0.09, orange, 'metal');
      }
    }

    // The valve bank occupies a real cover volume on the middle platform.
    for (const [x, height] of [
      [-8.25, 1.25],
      [-7, 1.65],
      [-5.75, 1.1],
    ] as const) {
      cylinder(x, 3.75 + height / 2, 1.22, 0.16, height, orange);
      const wheel = new THREE.TorusGeometry(0.38, 0.07, 6, 12);
      finish(
        wheel,
        material(orange, 'metal'),
        transform(x, 4.05 + height, 1.02),
      );
    }
    box(-7, 3.25, 1.06, 3, 0.22, 0.22, deepTeal, 'metal');

    // A low-poly wheel, hub and spokes replace the old rectangular "turbine".
    const turbineWheel = new THREE.CylinderGeometry(2.5, 2.5, 1.15, 16);
    turbineWheel.rotateX(Math.PI / 2);
    finish(
      turbineWheel,
      material(0x71391f, 'metal'),
      transform(20, 4.8, 20.64),
    );
    const turbineRim = new THREE.TorusGeometry(2.65, 0.2, 8, 20);
    finish(turbineRim, material(orange, 'metal'), transform(20, 4.8, 21.24));
    const axle = new THREE.CylinderGeometry(0.55, 0.55, 1.2, 12);
    axle.rotateX(Math.PI / 2);
    finish(axle, material(orange, 'metal'), transform(20, 4.8, 21.15));
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.BoxGeometry(0.18, 2.25, 0.16);
      spoke.rotateZ((i * Math.PI) / 4);
      finish(spoke, material(orange, 'metal'), transform(20, 4.8, 21.29));
    }
    for (const x of [15.5, 24.5]) {
      box(x, 5.25, 20.95, 0.32, 4.3, 0.32, deepTeal, 'metal');
      box(x, 7.55, 18, 0.32, 0.32, 6.2, deepTeal, 'metal');
    }

    // One low control house and two winches leave the dam wall dominant.
    for (const x of [-19.5, -17, -14.5, -12]) {
      box(x, 7.5, -24.08, 1.8, 1.4, 0.04, 0x263d42, 'metal');
      box(x, 8.55, -24.05, 0.08, 0.12, 0.14, orange, 'metal');
    }
    box(-16, 8.75, -27, 10.4, 0.15, 6.2, deepTeal, 'metal');
    for (const x of [-28, -4]) {
      const winch = new THREE.CylinderGeometry(0.8, 0.8, 2.1, 12);
      winch.rotateZ(Math.PI / 2);
      finish(winch, material(deepTeal, 'metal'), transform(x, 7.55, -27));
      for (const side of [-1, 1]) {
        const rim = new THREE.TorusGeometry(0.85, 0.09, 6, 12);
        rim.rotateY(Math.PI / 2);
        finish(
          rim,
          material(orange, 'metal'),
          transform(x + side * 0.9, 7.55, -27),
        );
      }
    }

    // Coarse rock clusters hide the rectangular boundary and give the whole
    // facility the quarry silhouette from the reference render.
    const rocks: ReadonlyArray<
      readonly [number, number, number, number, number, number]
    > = [
      [-36, 4.5, -27, 5, 8, 7],
      [-35, 6, -18, 6, 10, 8],
      [-36, 4, -8, 5, 7, 8],
      [-36, 3, 4, 4, 6, 9],
      [-35, 3, 20, 6, 6, 10],
      [-30, 2.5, 31, 10, 5, 5],
      [-17, 3, 32, 12, 6, 5],
      [0, 2.5, 33, 13, 5, 5],
      [16, 3, 32, 11, 6, 5],
      [31, 4, 30, 8, 8, 6],
      [36, 5, 21, 6, 9, 10],
      [36, 6, 9, 6, 11, 9],
      [36, 7, -4, 7, 12, 10],
      [36, 8, -17, 8, 14, 10],
      [32, 9, -29, 11, 15, 8],
      [19, 8, -33, 11, 13, 7],
      [7, 8, -34, 10, 12, 6],
      [-6, 9, -34, 11, 13, 7],
      [-20, 9, -34, 12, 14, 7],
      [-32, 7, -33, 9, 12, 8],
    ];
    // Ground outside the collision boundary anchors the quarry in terrain.
    box(0, -1.2, 0, 122, 1.4, 112, 0x8c775d);
    // Continuous spoil banks meet the outer wall, so the quarry does not read
    // as four paper-thin panels surrounded by isolated boulders. All vertices
    // stay outside the playable rectangle and batch with the rock material.
    const bankPoints: Array<THREE.Vector3[]> = [];
    for (let edge = 0; edge < 4; edge++) {
      const points: THREE.Vector3[] = [];
      for (let step = 0; step <= 12; step++) {
        const t = step / 12;
        const x = edge < 2 ? (edge === 0 ? -37 : 37) : -37 + t * 74;
        const z = edge < 2 ? -33 + t * 66 : edge === 2 ? -33 : 33;
        const height = edge === 2 ? 12 : edge === 3 ? 6 : 10;
        points.push(new THREE.Vector3(x, height, z));
        const offset = 10 + Math.sin(step * 2.17 + edge) * 3;
        points.push(
          new THREE.Vector3(
            x + (edge < 2 ? Math.sign(x) * offset : 0),
            height * 0.45 + Math.sin(step * 1.37 + edge) * 1.5,
            z + (edge >= 2 ? Math.sign(z) * offset : 0),
          ),
        );
        points.push(
          new THREE.Vector3(
            x + (edge < 2 ? Math.sign(x) * 23 : 0),
            -0.5,
            z + (edge >= 2 ? Math.sign(z) * 23 : 0),
          ),
        );
      }
      bankPoints.push(points);
    }
    const bankMaterial = material(0x88745c);
    bankMaterial.flatShading = true;
    for (const points of bankPoints) {
      const vertices: number[] = [];
      const triangle = (
        a: THREE.Vector3,
        b: THREE.Vector3,
        c: THREE.Vector3,
      ) => {
        const normal = new THREE.Vector3()
          .subVectors(b, a)
          .cross(new THREE.Vector3().subVectors(c, a));
        for (const point of normal.y >= 0 ? [a, b, c] : [a, c, b])
          vertices.push(point.x, point.y, point.z);
      };
      for (let i = 0; i < 12; i++) {
        for (let band = 0; band < 2; band++) {
          const a = i * 3 + band;
          triangle(points[a]!, points[a + 3]!, points[a + 1]!);
          triangle(points[a + 1]!, points[a + 3]!, points[a + 4]!);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(
          new Float32Array((vertices.length / 3) * 2),
          2,
        ),
      );
      geometry.computeVertexNormals();
      finish(geometry, bankMaterial, new THREE.Matrix4());
    }
    rocks.forEach(([x, y, z, sx, sy, sz], i) => {
      const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
      // Keep visual cliffs outside the playable boundary. The old boulders
      // protruded into collision-free routes and looked like floating spheres.
      const outerX = Math.abs(x) >= 32 ? Math.sign(x) * (37 + sx * 0.55) : x;
      const outerZ = Math.abs(z) >= 29 ? Math.sign(z) * (33 + sz * 0.55) : z;
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(outerX, y, outerZ),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(i * 0.17, i * 0.61, i * 0.11),
        ),
        new THREE.Vector3(sx * 0.9, sy * 0.55, sz * 0.9),
      );
      rockGeometry.applyMatrix4(matrix);
      rockGeometry.computeBoundingBox();
      const bounds = rockGeometry.boundingBox!;
      const dx =
        Math.abs(x) < 32
          ? 0
          : x > 0
            ? Math.max(0, 36.5 - bounds.min.x)
            : Math.min(0, -36.5 - bounds.max.x);
      const dz =
        Math.abs(z) < 29
          ? 0
          : z > 0
            ? Math.max(0, 32.5 - bounds.min.z)
            : Math.min(0, -32.5 - bounds.max.z);
      rockGeometry.translate(dx, -0.8 - bounds.min.y, dz);
      const rockMaterial = material([0x74614f, 0x88745c, 0x9a876e][i % 3]!);
      rockMaterial.flatShading = true;
      finish(rockGeometry, rockMaterial, new THREE.Matrix4());
    });

    // Frame the actual mouths; never paint an opaque rectangle across a route.
    for (const x of [-18.02, 16.02]) {
      box(x, 2.46, 5, 0.16, 0.08, 5.8, orange, 'metal');
      for (const z of [2.04, 7.96])
        box(x, 1.25, z, 0.16, 2.5, 0.08, deepTeal, 'metal');
    }
    box(4.5, 2.46, 19.02, 7, 0.08, 0.16, orange, 'metal');
    for (const x of [1.04, 7.96])
      box(x, 1.25, 19.02, 0.08, 2.5, 0.16, deepTeal, 'metal');
  } else if (mapDetails === 'full') {
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
  for (const [parent, batch] of [
    [root, batches],
    [tramRoot, tramBatches],
  ] as const)
    for (const [mat, geometries] of batch) {
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
        parent.add(mesh);
      }
      for (const g of new Set([...geometries, ...normalized])) g.dispose();
    }
  return {
    root,
    tram: tramRoot,
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
