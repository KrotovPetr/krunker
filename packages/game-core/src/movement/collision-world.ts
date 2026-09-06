import type * as Rapier from '@dimforge/rapier3d-compat';
import type { Vec3 } from '@fps/protocol';
import { rampVertices } from '../maps/arena.js';
import type { MapDefinition } from '../maps/arena.js';
import { MOVEMENT } from './config.js';

let physics: typeof Rapier | undefined;
let initialization: Promise<void> | undefined;
export function initializePhysics(): Promise<void> {
  initialization ??= import('@dimforge/rapier3d-compat')
    .then(async (module) => {
      await module.init();
      physics = module;
    })
    .catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}

export interface CollisionResult {
  movement: Vec3;
  grounded: boolean;
  normals: Vec3[];
}
export interface CollisionWorld {
  move(
    position: Vec3,
    height: number,
    displacement: Vec3,
    snap: boolean,
  ): CollisionResult;
  canOccupy(position: Vec3, height: number): boolean;
  raycast(origin: Vec3, direction: Vec3, range: number): number;
  raycastSurface?(
    origin: Vec3,
    direction: Vec3,
    range: number,
  ): { distance: number; normal: Vec3 } | undefined;
  dispose(): void;
}

export function createCollisionWorld(map: MapDefinition): CollisionWorld {
  if (!physics)
    throw new Error('Call initializePhysics() before creating a game');
  const R = physics;
  const world = new R.World({ x: 0, y: 0, z: 0 });
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  for (const block of map.blocks) {
    const { size, position, yaw } = block;
    const descriptor =
      block.shape === 'ramp'
        ? R.ColliderDesc.convexHull(new Float32Array(rampVertices(size)))
        : R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
    if (!descriptor) {
      world.free();
      throw new Error(`Invalid map solid: ${block.id}`);
    }
    descriptor.setTranslation(position.x, position.y, position.z);
    descriptor.setRotation({
      x: 0,
      y: Math.sin(yaw / 2),
      z: 0,
      w: Math.cos(yaw / 2),
    });
    world.createCollider(descriptor);
  }
  const capsule = (height: number) =>
    new R.Capsule(height / 2 - MOVEMENT.radius, MOVEMENT.radius);
  const shapes = new Map<number, Rapier.Capsule>([
    [MOVEMENT.standingHeight, capsule(MOVEMENT.standingHeight)],
    [MOVEMENT.crouchingHeight, capsule(MOVEMENT.crouchingHeight)],
  ]);
  const shapeFor = (height: number) => shapes.get(height) ?? capsule(height);
  // Scratch shape queries only the static map. Players do not block each other.
  const collider = world.createCollider(
    R.ColliderDesc.capsule(
      MOVEMENT.standingHeight / 2 - MOVEMENT.radius,
      MOVEMENT.radius,
    ),
  );
  const controller = world.createCharacterController(MOVEMENT.skin);
  controller.enableAutostep(0.28, 0.2, false);
  controller.setMaxSlopeClimbAngle((Math.PI * 50) / 180);
  controller.setMinSlopeSlideAngle((Math.PI * 55) / 180);
  world.step();
  let disposed = false;
  const assertLive = () => {
    if (disposed) throw new Error('Collision world is disposed');
  };
  return {
    move(position, height, displacement, snap) {
      assertLive();
      collider.setShape(shapeFor(height));
      collider.setTranslation({
        x: position.x,
        y: position.y + height / 2,
        z: position.z,
      });
      if (snap) controller.enableSnapToGround(0.3);
      else controller.disableSnapToGround();
      controller.computeColliderMovement(collider, displacement);
      const normals: Vec3[] = [];
      for (let i = 0; i < controller.numComputedCollisions(); i++) {
        const collision = controller.computedCollision(i);
        if (collision) normals.push({ ...collision.normal1 });
      }
      return {
        movement: { ...controller.computedMovement() },
        grounded: controller.computedGrounded(),
        normals,
      };
    },
    canOccupy(position, height) {
      assertLive();
      const center = {
        x: position.x,
        y: position.y + height / 2,
        z: position.z,
      };
      const shape = shapeFor(height);
      let clear = true;
      world.intersectionsWithShape(
        center,
        rotation,
        shape,
        (obstacle) => {
          // Confirm penetration: intersection queries can include near contacts on large floors.
          const contact = obstacle.contactShape(shape, center, rotation, 0);
          if (contact && contact.distance < 0) clear = false;
          return clear;
        },
        undefined,
        undefined,
        collider,
      );
      return clear;
    },
    raycast(origin, direction, range) {
      assertLive();
      return (
        world.castRay(
          new R.Ray(origin, direction),
          range,
          true,
          undefined,
          undefined,
          collider,
        )?.timeOfImpact ?? range
      );
    },
    raycastSurface(origin, direction, range) {
      assertLive();
      const hit = world.castRayAndGetNormal(
        new R.Ray(origin, direction),
        range,
        true,
        undefined,
        undefined,
        collider,
      );
      return hit
        ? { distance: hit.timeOfImpact, normal: { ...hit.normal } }
        : undefined;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      world.free();
    },
  };
}
