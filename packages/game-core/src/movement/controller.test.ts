import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ARENA } from '../maps/arena.js';
import type { MapBlock } from '../maps/arena.js';
import { createCollisionWorld, initializePhysics } from './collision-world.js';
import type { CollisionWorld } from './collision-world.js';
import {
  createMovementState,
  EMPTY_BUTTONS,
  predictPlayerMovement,
} from './controller.js';
import type { MovementState } from './controller.js';
import { createFixedStepper } from './fixed-step.js';
import { MOVEMENT as M } from './config.js';
import type { InputCommand, Vec3 } from '@fps/protocol';

beforeAll(initializePhysics);
const worlds: CollisionWorld[] = [];
afterEach(() => {
  worlds.forEach((world) => world.dispose());
  worlds.length = 0;
});
const block = (id: string, position: Vec3, size: Vec3): MapBlock => ({
  id,
  shape: 'box',
  position,
  size,
  yaw: 0,
  color: 0,
});
const floor = block('floor', { x: 0, y: -0.5, z: 0 }, { x: 400, y: 1, z: 400 });
function world(extra: MapBlock[] = []) {
  const result = createCollisionWorld({
    id: 'test',
    blocks: [floor, ...extra],
    spawns: [],
  });
  worlds.push(result);
  return result;
}
const input = (
  buttons: Partial<InputCommand['buttons']> = {},
  yaw = 0,
): InputCommand => ({
  type: 'input',
  seq: 1,
  buttons: { ...EMPTY_BUTTONS, ...buttons },
  yaw,
  pitch: 0,
});
function run(
  state: MovementState,
  collision: CollisionWorld,
  command = input(),
  ticks = 60,
) {
  for (let i = 0; i < ticks; i++)
    state = predictPlayerMovement(state, command, 1 / 60, collision);
  return state;
}
const spawn = (x = 0, y = 0.03, z = 0) => createMovementState({ x, y, z });
const speed = (state: MovementState) =>
  Math.hypot(state.velocity.x, state.velocity.z);

describe('Rapier movement', () => {
  it('lands on the floor and remains grounded', () => {
    const state = run(spawn(0, 10), world(), input(), 240);
    expect(state.grounded).toBe(true);
    expect(state.position.y).toBeCloseTo(M.skin, 1);
    expect(state.velocity.y).toBe(0);
  });
  it('accelerates to walking speed without a diagonal advantage', () => {
    const collision = world();
    const start = run(spawn(), collision);
    const first = run(start, collision, input({ forward: true }), 1);
    const straight = run(start, collision, input({ forward: true }));
    const diagonal = run(
      start,
      collision,
      input({ forward: true, right: true }),
    );
    expect(speed(first)).toBeGreaterThan(0);
    expect(speed(first)).toBeLessThan(M.walkSpeed);
    expect(speed(straight)).toBeCloseTo(M.walkSpeed);
    expect(speed(diagonal)).toBeCloseTo(M.walkSpeed);
  });
  it('jumps once per press and returns to the floor', () => {
    const collision = world();
    const grounded = run(spawn(), collision);
    const jumped = run(grounded, collision, input({ jump: true }), 1);
    expect(jumped.position.y).toBeGreaterThan(grounded.position.y);
    expect(jumped.grounded).toBe(false);
    const landed = run(jumped, collision, input({ jump: true }), 180);
    expect(landed.grounded).toBe(true);
    expect(landed.position.y).toBeLessThan(0.04);
  });
  it('blocks walls and slides along them', () => {
    const collision = world([
      block('wall', { x: 0, y: 2, z: -4 }, { x: 30, y: 4, z: 1 }),
    ]);
    const state = run(
      spawn(),
      collision,
      input({ forward: true, right: true }),
      90,
    );
    expect(state.position.z).toBeGreaterThanOrEqual(-3.5 + M.radius);
    expect(state.position.x).toBeGreaterThan(5);
    expect(collision.canOccupy(state.position, M.standingHeight)).toBe(true);
  });
  it('stops upward movement at a ceiling', () => {
    const collision = world([
      block('ceiling', { x: 0, y: 2.5, z: 0 }, { x: 8, y: 0.4, z: 8 }),
    ]);
    let state = run(spawn(), collision);
    for (let i = 0; i < 120; i++) {
      state = run(state, collision, input({ jump: i === 0 }), 1);
      expect(state.position.y + M.standingHeight).toBeLessThanOrEqual(2.301);
    }
    expect(state.grounded).toBe(true);
  });
  it('crouches through a tunnel and cannot stand inside its roof', () => {
    const collision = world([
      block('roof', { x: 0, y: 1.65, z: -3 }, { x: 8, y: 0.8, z: 6 }),
    ]);
    const blocked = run(
      spawn(0, 0.03, 2),
      collision,
      input({ forward: true }),
      60,
    );
    expect(blocked.position.z).toBeGreaterThan(0);
    let state = run(
      spawn(0, 0.03, 2),
      collision,
      input({ forward: true, crouch: true }),
      60,
    );
    expect(state.position.z).toBeLessThan(-1);
    state = run(state, collision, input(), 30);
    expect(state.crouched).toBe(true);
    state = run(state, collision, input({ forward: true, crouch: true }), 120);
    state = run(state, collision, input(), 1);
    expect(state.position.z).toBeLessThan(-6.5);
    expect(state.crouched).toBe(false);
  });
  it('climbs and descends a ramp without losing floor contact', () => {
    const ramp: MapBlock = {
      ...block('ramp', { x: 0, y: 1.5, z: 0 }, { x: 12, y: 3, z: 6 }),
      shape: 'ramp',
    };
    const collision = world([
      ramp,
      block('deck', { x: 12, y: 1.5, z: 0 }, { x: 12, y: 3, z: 6 }),
    ]);
    const top = run(
      spawn(-8),
      collision,
      input({ forward: true }, -Math.PI / 2),
      150,
    );
    expect(top.position.x).toBeGreaterThan(8);
    expect(top.position.y).toBeCloseTo(3 + M.skin, 1);
    expect(top.grounded).toBe(true);
    const bottom = run(
      top,
      collision,
      input({ forward: true }, Math.PI / 2),
      180,
    );
    expect(bottom.position.x).toBeLessThan(-7);
    expect(bottom.position.y).toBeLessThan(0.04);
    expect(bottom.grounded).toBe(true);
  });
  it('walks up the arena stairs onto the north deck', () => {
    const collision = createCollisionWorld(ARENA);
    worlds.push(collision);
    const state = run(
      spawn(25, 0.03, -17),
      collision,
      input({ forward: true }, Math.PI / 2),
      150,
    );
    expect(state.position.x).toBeLessThan(12);
    expect(state.position.y).toBeCloseTo(3 + M.skin, 1);
  });
  it('slides from a run and retains momentum during a slide hop', () => {
    const collision = world();
    const running = run(spawn(), collision, input({ forward: true }));
    const sliding = run(
      running,
      collision,
      input({ forward: true, crouch: true }),
      1,
    );
    expect(sliding.sliding).toBe(true);
    expect(speed(sliding)).toBeGreaterThan(M.walkSpeed);
    const hopping = run(
      sliding,
      collision,
      input({ forward: true, crouch: true, jump: true }),
      1,
    );
    expect(hopping.grounded).toBe(false);
    expect(speed(hopping)).toBeCloseTo(speed(sliding) * M.hopRetention);
  });
  it('caps speed through repeated slides, hops and air strafing', () => {
    const collision = world();
    let state = run(spawn(), collision, input({ forward: true }));
    for (let i = 0; i < 1200; i++) {
      state = run(
        state,
        collision,
        input(
          {
            forward: true,
            right: i % 20 < 10,
            crouch: i % 50 < 45,
            jump: i % 40 === 0,
          },
          Math.atan2(Math.sin(i / 40), Math.cos(i / 40)),
        ),
        1,
      );
      expect(speed(state)).toBeLessThanOrEqual(M.maxSpeed + 1e-6);
      expect(state.position.y).toBeGreaterThan(-0.01);
    }
  });
  it('keeps every arena spawn clear and supported', () => {
    const collision = createCollisionWorld(ARENA);
    worlds.push(collision);
    for (const position of ARENA.spawns) {
      expect(collision.canOccupy(position, M.standingHeight)).toBe(true);
      const state = run(createMovementState(position), collision);
      expect(state.grounded).toBe(true);
      expect(Math.abs(state.position.y - position.y)).toBeLessThan(0.05);
    }
  });
  it('does not mutate the input movement state', () => {
    const state = spawn();
    const original = structuredClone(state);
    predictPlayerMovement(state, input({ forward: true }), 1 / 60, world());
    expect(state).toEqual(original);
  });
});

describe('fixed timestep', () => {
  it('produces identical motion at 60 and 144 render frames per second', () => {
    const collision = world();
    function simulate(fps: number) {
      let state = spawn();
      let tick = 0;
      const stepper = createFixedStepper(60);
      for (let frame = 0; frame < fps * 10; frame++)
        stepper.advance(1 / fps, (dt) => {
          state = predictPlayerMovement(
            state,
            input({
              forward: true,
              crouch: tick % 90 > 30,
              jump: tick % 50 === 35,
            }),
            dt,
            collision,
          );
          tick++;
        });
      return { tick, state };
    }
    expect(simulate(144)).toEqual(simulate(60));
  });
  it('limits catch-up after a suspended tab', () => {
    let steps = 0;
    createFixedStepper(60).advance(120, () => steps++);
    expect(steps).toBe(15);
  });
});

it('steers an airborne slide hop without adding speed or reversing instantly', () => {
  const collision = world();
  const initial = spawn(0, 5, 0);
  initial.velocity = { x: 0, y: 0, z: -15 };
  const turned = run(
    initial,
    collision,
    input({ forward: true }, -Math.PI / 2),
    10,
  );
  expect(turned.velocity.x).toBeGreaterThan(3);
  expect(turned.velocity.z).toBeLessThan(-10);
  expect(speed(turned)).toBeLessThanOrEqual(15.1);
});
it('keeps landing momentum briefly so a buffered slide hop does not lose its run-up', () => {
  const collision = world();
  const initial = run(spawn(), collision);
  initial.velocity.z = -15;
  initial.landingRemaining = M.landingGrace;
  const grace = run(initial, collision, input({ forward: true }), 2);
  expect(speed(grace)).toBeCloseTo(15);
  const settled = run(grace, collision, input({ forward: true }), 40);
  expect(speed(settled)).toBeCloseTo(M.walkSpeed);
});
it('keeps the practice and match spawns outside every map solid', () => {
  const collision = createCollisionWorld(ARENA);
  worlds.push(collision);
  for (const position of [...ARENA.spawns, ...(ARENA.practice?.spawns ?? [])])
    expect(collision.canOccupy(position, M.standingHeight)).toBe(true);
});

it('keeps forward momentum after clearing a stair face while still stopping at walls', () => {
  const collision = world(
    Array.from({ length: 10 }, (_, i) =>
      block(
        'step' + i,
        { x: 0, y: (i + 1) * 0.12, z: -2 - i * 0.6 },
        { x: 3, y: (i + 1) * 0.24, z: 0.6 },
      ),
    ),
  );
  let state = run(spawn(), collision, input(), 20),
    climbed = 0;
  for (let i = 0; i < 90; i++) {
    const previous = state;
    state = predictPlayerMovement(
      state,
      input({ forward: true }),
      1 / 60,
      collision,
    );
    if (state.grounded && state.position.y - previous.position.y > 0.1) {
      climbed++;
      expect(speed(state)).toBeGreaterThan(M.walkSpeed * 0.7);
    }
  }
  expect(climbed).toBeGreaterThan(5);
});
