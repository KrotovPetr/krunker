import { createCombatEffects } from './combat-effects.js';
import { createCharacter } from './character.js';
import { createEnemyMarkers } from './enemy-markers.js';
import type { VisibilityTest } from './enemy-markers.js';
import * as THREE from 'three';
import { createEnvironment } from './environment.js';
import { createViewWeapon } from './view-weapon.js';
import {
  ARENA,
  CITY,
  getMap,
  movingTargets,
  PARKOUR_CHECKPOINTS,
  MOVEMENT,
  playerHeight,
} from '@fps/game-core';
import type { GameSnapshot, PlayerSnapshot, ServerEvent } from '@fps/protocol';

export function createScene(container: HTMLElement, hasSight: VisibilityTest) {
  const scene = new THREE.Scene();
  const enemyMarkers = createEnemyMarkers(scene, hasSight);
  let markerSnapshot: GameSnapshot | undefined;
  scene.background = new THREE.Color(0xc7d9df);
  scene.fog = new THREE.Fog(0xc7d9df, 65, 150);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 150);
  camera.rotation.order = 'YXZ';
  const overview = () => {
    camera.position.set(36, 38, 42);
    camera.lookAt(0, 0, 0);
  };
  overview();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xd4e7f0, 0x7d705d, 2.1));
  const sun = new THREE.DirectionalLight(0xffe4bc, 3.2);
  sun.position.set(8, 20, 10);
  scene.add(sun);
  let map = CITY;
  let environment = createEnvironment(map);
  scene.add(environment.root);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -38,
    right: 38,
    top: 36,
    bottom: -36,
    near: 1,
    far: 100,
  });
  sun.position.set(-24, 36, 22);
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00008;
  // The map is static; render its shadow atlas only when a map is loaded.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const players = new Map<
    string,
    {
      mesh: THREE.Group;
      rig: ReturnType<typeof createCharacter>;
      target: THREE.Vector3;
      state: PlayerSnapshot;
    }
  >();
  const range = new THREE.Group();
  const targetGroups = new Map<string, THREE.Group>();
  const targetMaterials = new Map<
    string,
    { material: THREE.MeshStandardMaterial; hitRemaining: number }
  >();
  for (const target of ARENA.practice?.targets ?? []) {
    const group = new THREE.Group();
    group.position.set(target.position.x, target.position.y, target.position.z);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf2ab56,
      roughness: 0.8,
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 1.44, 0.64),
      material,
    );
    body.position.y = 0.72;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.36, 0.46),
      material,
    );
    head.position.y = 1.62;
    const bullseye = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.16, 24),
      new THREE.MeshBasicMaterial({ color: 0x172426 }),
    );
    bullseye.position.set(0, 0.95, 0.325);
    group.add(body, head, bullseye);
    range.add(group);
    targetGroups.set(target.id, group);
    targetMaterials.set(target.id, { material, hitRemaining: 0 });
  }
  scene.add(range);
  range.visible = false;
  const course = new THREE.Group();
  const courseTextures: THREE.Texture[] = [];
  const gates = PARKOUR_CHECKPOINTS.map((point, i) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0x7aa5a0,
      transparent: true,
      opacity: 0.3,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.08, 8, 32),
      material,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(point.x, point.y + 0.15, point.z);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 2.5, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x5fed9e,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.set(point.x, point.y + 1.25, point.z);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#142d32';
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b9f5ce';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#e5ffed';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), 64, 67);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    courseTextures.push(texture);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true }),
    );
    label.position.set(point.x, point.y + 3, point.z);
    label.scale.set(1, 1, 1);
    course.add(ring, beam, label);
    return { ring, beam, label, material };
  });
  scene.add(course);
  course.visible = false;
  const effects = createCombatEffects(scene);
  const viewWeapon = createViewWeapon(camera);
  scene.add(camera);
  const traces: { line: THREE.Line; remaining: number }[] = [];
  let aiming = false;
  let localId = '';
  let firstPerson = false;
  let personalChallenge = false;
  let yaw = 0,
    pitch = 0;
  let frameHandler: ((deltaSeconds: number) => void) | undefined;
  let previousTime: number | undefined;
  let eyeHeight: number = MOVEMENT.standingHeight - MOVEMENT.eyeInset;
  let cameraFeet: number | undefined,
    cameraLife = -1;
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  renderer.setAnimationLoop((time) => {
    const dt =
      previousTime === undefined
        ? 0
        : Math.min((time - previousTime) / 1000, 0.25);
    previousTime = time;
    frameHandler?.(dt);
    effects.update(dt);
    for (const [id, player] of players) {
      player.mesh.position.copy(player.target);
      player.mesh.scale.y =
        playerHeight(player.state) / MOVEMENT.standingHeight;
      player.mesh.visible =
        player.rig.update(player.state, dt) &&
        player.state.ready &&
        !(firstPerson && (id === localId || personalChallenge));
    }
    const local = players.get(localId);
    if (firstPerson && local) {
      const height = playerHeight(local.state);
      eyeHeight +=
        (height - MOVEMENT.eyeInset - eyeHeight) * (1 - Math.exp(-dt * 25));
      camera.position.copy(local.mesh.position);
      const feet = local.mesh.position.y - height / 2;
      if (
        cameraFeet === undefined ||
        cameraLife !== local.state.lifeId ||
        !local.state.grounded ||
        Math.abs(feet - cameraFeet) > 0.8
      )
        cameraFeet = feet;
      else cameraFeet += (feet - cameraFeet) * (1 - Math.exp(-dt * 16));
      cameraLife = local.state.lifeId;
      camera.position.y = cameraFeet + eyeHeight;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
    if (!firstPerson) cameraFeet = undefined;
    for (const target of targetMaterials.values()) {
      target.hitRemaining = Math.max(0, target.hitRemaining - dt);
      target.material.emissive.setHex(
        target.hitRemaining > 0 ? 0x23945d : 0x000000,
      );
    }
    camera.fov = viewWeapon.update(dt, local?.state, firstPerson, aiming);
    camera.updateProjectionMatrix();
    for (let i = traces.length - 1; i >= 0; i--) {
      const trace = traces[i]!;
      trace.remaining -= dt;
      if (trace.remaining <= 0) {
        scene.remove(trace.line);
        trace.line.geometry.dispose();
        (trace.line.material as THREE.Material).dispose();
        traces.splice(i, 1);
      }
    }
    renderer.domElement.dataset.enemyMarkers = String(
      enemyMarkers.update(markerSnapshot, localId, camera, firstPerson, time),
    );
    renderer.render(scene, camera);
  });

  return {
    canvas: renderer.domElement,
    onFrame(callback: (deltaSeconds: number) => void) {
      frameHandler = callback;
    },
    setAiming(enabled: boolean) {
      aiming = enabled;
    },
    shotFeedback(knife = false) {
      viewWeapon.shot(knife);
      if (!knife) effects.eject(camera.position, yaw);
    },
    event(event: ServerEvent) {
      effects.event(event);
      if (
        event.type === 'shot' &&
        event.playerId !== localId &&
        event.weapon !== 'knife'
      )
        effects.eject(
          event.origin,
          players.get(event.playerId)?.state.yaw ?? 0,
        );
      if (event.type === 'shot') players.get(event.playerId)?.rig.shot();
      if (event.type === 'practiceHit') {
        const target = targetMaterials.get(event.targetId);
        if (target) target.hitRemaining = 0.18;
      }
      if (event.type !== 'shot' || event.weapon === 'knife') return;
      for (const end of event.ends) {
        if (traces.length >= 64) break;
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(event.origin.x, event.origin.y, event.origin.z),
            new THREE.Vector3(end.x, end.y, end.z),
          ]),
          new THREE.LineBasicMaterial({
            color: event.playerId === localId ? 0xffd08a : 0xffffff,
            transparent: true,
            opacity: 0.65,
          }),
        );
        traces.push({ line, remaining: 0.065 });
        scene.add(line);
      }
    },
    setLook(look: { yaw: number; pitch: number }) {
      yaw = look.yaw;
      pitch = look.pitch;
    },
    setFirstPerson(enabled: boolean) {
      firstPerson = enabled;
      if (!enabled) overview();
    },
    update(snapshot: GameSnapshot, sessionId: string) {
      if (snapshot.mapId !== map.id) {
        enemyMarkers.reset();
        effects.reset();
        environment.dispose();
        map = getMap(snapshot.mapId);
        const sky = map.id === 'sandgate' ? 0xd1dcde : 0xc7d9df;
        (scene.background as THREE.Color).setHex(sky);
        (scene.fog as THREE.Fog).color.setHex(sky);
        environment = createEnvironment(map);
        scene.add(environment.root);
        renderer.shadowMap.needsUpdate = true;
        for (const trace of traces) {
          scene.remove(trace.line);
          trace.line.geometry.dispose();
          (trace.line.material as THREE.Material).dispose();
        }
        traces.length = 0;
      }
      renderer.domElement.dataset.map = map.id;
      markerSnapshot = snapshot;
      localId = sessionId;
      personalChallenge =
        snapshot.mode === 'training' || snapshot.mode === 'parkour';
      const local = snapshot.players.find((p) => p.id === sessionId);
      range.visible =
        map.id === 'switchyard' &&
        snapshot.mode !== 'parkour' &&
        snapshot.phase === 'waiting' &&
        snapshot.players.length > 0;
      const targets =
        snapshot.mode === 'training'
          ? movingTargets(ARENA, snapshot.tick)
          : (ARENA.practice?.targets ?? []);
      targets.forEach((target, i) => {
        targetGroups
          .get(target.id)
          ?.position.set(
            target.position.x,
            target.position.y,
            target.position.z,
          );
        const selected =
          snapshot.mode !== 'training' ||
          local?.challenge.status !== 'running' ||
          (local.challenge.targetIndex === i &&
            snapshot.tick >= local.challenge.targetTick);
        targetGroups.get(target.id)!.visible = selected;
        targetMaterials
          .get(target.id)
          ?.material.color.setHex(
            selected
              ? snapshot.mode === 'training'
                ? 0x58f0a0
                : 0xf2ab56
              : 0x435354,
          );
      });
      course.visible = snapshot.mode === 'parkour';
      const next = local?.challenge.checkpoint ?? 0;
      gates.forEach((gate, i) => {
        gate.material.color.setHex(
          i === next ? 0x65ffa8 : i < next ? 0xe1b978 : 0x7aa5a0,
        );
        gate.material.opacity = i === next ? 1 : i < next ? 0.15 : 0.3;
        gate.beam.visible = i === next;
        gate.label.visible = i >= next;
        gate.label.scale.setScalar(i === next ? 1.5 : 1);
      });
      const active = new Set(snapshot.players.map((player) => player.id));
      for (const [id, player] of players) {
        if (!active.has(id)) {
          player.rig.dispose();
          players.delete(id);
        }
      }
      for (const player of snapshot.players) {
        const target = new THREE.Vector3(
          player.position.x,
          player.position.y + playerHeight(player) / 2,
          player.position.z,
        );
        let rendered = players.get(player.id);
        if (!rendered) {
          const rig = createCharacter(player.bot);
          const mesh = rig.root;
          rendered = { mesh, rig, target, state: player };
          players.set(player.id, rendered);
          mesh.position.copy(target);
          scene.add(mesh);
        }
        rendered.target.copy(target);
        rendered.state = player;
        rendered.mesh.rotation.y = player.yaw;
      }
      renderer.domElement.dataset.playerCount = String(players.size);
    },
    dispose() {
      observer.disconnect();
      enemyMarkers.dispose();
      environment.dispose();
      effects.dispose();
      for (const texture of courseTextures) texture.dispose();
      renderer.setAnimationLoop(null);
      for (const player of players.values()) player.rig.dispose();
      players.clear();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Line ||
          object instanceof THREE.Sprite
        ) {
          geometries.add(object.geometry);
          for (const material of [object.material].flat())
            materials.add(material);
        }
      });
      for (const item of geometries) item.dispose();
      for (const item of materials) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
