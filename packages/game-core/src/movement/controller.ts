import type { InputCommand, MovementSnapshot, Vec3 } from '@fps/protocol';
import type { CollisionWorld } from './collision-world.js';
import { MOVEMENT as M } from './config.js';

export type MovementState = MovementSnapshot;

export const EMPTY_BUTTONS: InputCommand['buttons'] = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  crouch: false,
};

export function createMovementState(position: Vec3): MovementState {
  return {
    position: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    grounded: false,
    crouched: false,
    sliding: false,
    slideRemaining: 0,
    slideCooldown: 0,
    jumpBuffer: 0,
    coyoteRemaining: 0,
    jumpWasDown: false,
    crouchWasDown: false,
    landed: false,
    aimProgress: 0,
    landingRemaining: 0,
  };
}

export function playerHeight(
  state: Pick<MovementSnapshot, 'crouched'>,
): number {
  return state.crouched ? M.crouchingHeight : M.standingHeight;
}

/** Pure with respect to player state; the world is used only for static shape queries. */
export function predictPlayerMovement(
  state: MovementState,
  input: InputCommand,
  dt: number,
  collisionWorld: CollisionWorld,
  speedScale = 1,
  aimSeconds = 0.14,
): MovementState {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 1 / 30)
    throw new Error('Invalid movement timestep');
  const next: MovementState = {
    ...state,
    position: { ...state.position },
    velocity: { ...state.velocity },
    yaw: input.yaw,
    pitch: input.pitch,
  };
  const buttons = input.buttons;
  const aimDelta = dt / aimSeconds;
  next.aimProgress = Math.max(
    0,
    Math.min(1, state.aimProgress + (input.aiming ? aimDelta : -aimDelta)),
  );
  speedScale *= 1 - next.aimProgress * 0.25;
  next.landingRemaining = Math.max(0, state.landingRemaining - dt);
  next.slideCooldown = Math.max(0, state.slideCooldown - dt);
  next.slideRemaining = Math.max(0, state.slideRemaining - dt);
  next.jumpBuffer =
    buttons.jump && !state.jumpWasDown
      ? M.jumpBuffer
      : Math.max(0, state.jumpBuffer - dt);
  next.coyoteRemaining = state.grounded
    ? M.coyoteTime
    : Math.max(0, state.coyoteRemaining - dt);
  next.crouched =
    buttons.crouch ||
    (state.crouched &&
      !collisionWorld.canOccupy(state.position, M.standingHeight));
  let speed = Math.hypot(next.velocity.x, next.velocity.z);
  if (
    state.grounded &&
    buttons.crouch &&
    (!state.crouchWasDown || state.landed) &&
    speed >= M.slideMinSpeed &&
    next.slideCooldown === 0
  ) {
    const boosted = Math.min(speed + M.slideBoost, M.maxSpeed);
    next.velocity.x *= boosted / speed;
    next.velocity.z *= boosted / speed;
    speed = boosted;
    next.slideRemaining = M.slideDuration;
    next.slideCooldown = M.slideCooldown;
  }
  next.sliding =
    state.grounded &&
    next.crouched &&
    next.slideRemaining > 0 &&
    speed > M.crouchSpeed;
  let grounded = state.grounded;
  if (next.jumpBuffer > 0 && next.coyoteRemaining > 0) {
    next.velocity.y = M.jumpSpeed;
    if (next.sliding) {
      next.velocity.x *= M.hopRetention;
      next.velocity.z *= M.hopRetention;
    }
    next.jumpBuffer = 0;
    next.coyoteRemaining = 0;
    next.sliding = false;
    next.slideRemaining = 0;
    grounded = false;
  }

  const forward = Number(buttons.forward) - Number(buttons.back);
  const right = Number(buttons.right) - Number(buttons.left);
  const length = Math.hypot(forward, right);
  const wishX = length
    ? (right * Math.cos(input.yaw) - forward * Math.sin(input.yaw)) / length
    : 0;
  const wishZ = length
    ? (-forward * Math.cos(input.yaw) - right * Math.sin(input.yaw)) / length
    : 0;
  const velocity = next.velocity;
  if (grounded && !next.sliding) {
    if (length) {
      const baseTarget =
        (next.crouched ? M.crouchSpeed : M.walkSpeed) * speedScale;
      const target =
        next.landingRemaining > 0 && !next.crouched
          ? Math.max(baseTarget, speed)
          : baseTarget;
      const dx = wishX * target - velocity.x,
        dz = wishZ * target - velocity.z;
      const difference = Math.hypot(dx, dz);
      const fraction = difference
        ? Math.min(1, (M.groundAcceleration * dt) / difference)
        : 0;
      velocity.x += dx * fraction;
      velocity.z += dz * fraction;
    } else {
      const friction = Math.max(0, 1 - M.groundFriction * dt);
      velocity.x *= friction;
      velocity.z *= friction;
    }
  } else {
    if (next.sliding) {
      const friction = Math.max(0, 1 - M.slideFriction * dt);
      velocity.x *= friction;
      velocity.z *= friction;
    }
    if (length && speed > 0.1) {
      const current = Math.atan2(velocity.z, velocity.x);
      const desired = Math.atan2(wishZ, wishX);
      const difference = Math.atan2(
        Math.sin(desired - current),
        Math.cos(desired - current),
      );
      const turnLimit = (next.sliding ? M.slideTurnRate : M.airTurnRate) * dt;
      const turn = Math.max(-turnLimit, Math.min(turnLimit, difference));
      const magnitude = Math.hypot(velocity.x, velocity.z);
      velocity.x = Math.cos(current + turn) * magnitude;
      velocity.z = Math.sin(current + turn) * magnitude;
    }
    const alongWish = velocity.x * wishX + velocity.z * wishZ;
    const acceleration = Math.min(
      Math.max(0, M.walkSpeed * speedScale - alongWish),
      (next.sliding ? M.slideSteering : M.airAcceleration) * dt,
      Math.max(
        0,
        M.walkSpeed * speedScale - Math.hypot(velocity.x, velocity.z),
      ),
    );
    velocity.x += wishX * acceleration;
    velocity.z += wishZ * acceleration;
  }
  speed = Math.hypot(velocity.x, velocity.z);
  if (speed > M.maxSpeed) {
    velocity.x *= M.maxSpeed / speed;
    velocity.z *= M.maxSpeed / speed;
  }
  velocity.y = grounded
    ? -M.gravity * dt
    : Math.max(-M.terminalVelocity, velocity.y - M.gravity * dt);
  const result = collisionWorld.move(
    next.position,
    playerHeight(next),
    { x: velocity.x * dt, y: velocity.y * dt, z: velocity.z * dt },
    grounded && velocity.y <= 0,
  );
  next.position.x += result.movement.x;
  next.position.y += result.movement.y;
  next.position.z += result.movement.z;
  next.grounded = result.grounded && velocity.y <= 0;
  next.landed = next.grounded && !state.grounded;
  if (next.landed) next.landingRemaining = M.landingGrace;
  if (next.grounded && velocity.y < 0) velocity.y = 0;
  for (const normal of result.normals) {
    if (normal.y < -0.5 && velocity.y > 0) velocity.y = 0;
    if (Math.abs(normal.y) < 0.5) {
      const dot = velocity.x * normal.x + velocity.z * normal.z;
      const normalLengthSq = normal.x ** 2 + normal.z ** 2;
      // Autostep reports the tread's vertical face even when it cleared it.
      const actual =
        result.movement.x * normal.x + result.movement.z * normal.z;
      const clearedStep =
        result.grounded && result.movement.y > 0.01 && actual <= dot * dt * 0.8;
      if (dot < 0 && normalLengthSq > 0 && !clearedStep) {
        velocity.x -= (dot * normal.x) / normalLengthSq;
        velocity.z -= (dot * normal.z) / normalLengthSq;
      }
    }
  }
  if (!next.grounded) next.sliding = false;
  next.jumpWasDown = buttons.jump;
  next.crouchWasDown = buttons.crouch;
  return next;
}
