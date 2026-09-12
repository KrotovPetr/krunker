import { afterEach, beforeAll, expect, it } from 'vitest';
import {
  CITY,
  createCollisionWorld,
  createGame,
  DEFAULT_CONFIG,
  initializePhysics,
  predictPlayerMovement,
} from '../index.js';
import { createBotBrain, createNavigation, visible } from './brain.js';
import { choosePosition } from './tactics.js';
import {
  controlBotDirective,
  emptyControl,
  stepControl,
} from '../control/control.js';
import type { PlayerSnapshot } from '@fps/protocol';

beforeAll(initializePhysics);
const resources: { dispose(): void }[] = [];
afterEach(() => resources.splice(0).forEach((r) => r.dispose()));
function fixture() {
  const game = createGame(DEFAULT_CONFIG, CITY, 0),
    world = createCollisionWorld(CITY);
  resources.push(game, world);
  game.enqueue({ type: 'join', playerId: 'p', nickname: 'Bot' });
  game.step(1 / 60);
  const player: PlayerSnapshot = {
    ...game.snapshot().players[0]!,
    id: 'b0',
    bot: true,
    ally: true,
    ready: true,
    protectionRemaining: 0,
    position: { x: 0, y: 0.03, z: -5 },
    yaw: 0,
  };
  const nav = createNavigation(CITY, world);
  const directive = controlBotDirective(
    player,
    [player],
    emptyControl(),
    CITY.control!,
  );
  return { player, world, nav, directive };
}

it('keeps an anchor alive, assigns ranged support only on ownership and recalls it on contest', () => {
  const { player } = fixture();
  const sniper: PlayerSnapshot = { ...player, id: 'b1', weapon: 'sniper' };
  const state = emptyControl();
  const squad = [sniper, player];
  const role = (p: PlayerSnapshot) =>
    controlBotDirective(p, squad, state, CITY.control!).tactical;
  expect(role(sniper)).toBe('capture');
  state.owner = 'allies';
  expect(role(player)).toBe('capture');
  expect(role(sniper)).toBe('guard');
  state.contested = true;
  expect(role(sniper)).toBe('capture');
  state.contested = false;
  player.health = 0;
  expect(role(sniper)).toBe('capture');
  player.health = 100;
  player.connected = false;
  expect(role(sniper)).toBe('capture');
  player.connected = true;
  state.owner = 'enemies';
  expect(role(sniper)).toBe('capture');
});

it('distributes allies among scoring positions rather than stacking at the centre', () => {
  const { player, world, nav, directive } = fixture();
  const occupied = [];
  for (let index = 0; index < 3; index++) {
    const goal = choosePosition(
      player,
      nav,
      world,
      'advance',
      index,
      new Set(),
      { directive, occupied },
    );
    expect(goal).toBeDefined();
    expect(
      occupied.every(
        (p) => Math.hypot(p.x - goal!.position.x, p.z - goal!.position.z) > 1.5,
      ),
    ).toBe(true);
    occupied.push(goal!.position);
    const state = emptyControl();
    stepControl(
      state,
      5,
      [{ ...player, position: goal!.position }],
      CITY.control!,
      world,
    );
    expect(state.owner, goal!.key).toBe('allies');
  }
});

it('provides actual cover from both approaches without breaking capture or the mission passage', () => {
  const { player, world, nav } = fixture();
  for (const [name, threatZ] of [
    ['point-north-shelter', -14],
    ['point-south-shelter', 2],
  ] as const) {
    const position = CITY.tacticalPositions!.find(
      (p) => p.id === name,
    )!.position;
    expect(world.canOccupy(position, 1.8)).toBe(true);
    expect(
      visible(
        world,
        { ...position, y: 1.65 },
        { x: position.x, y: 1, z: threatZ },
      ),
    ).toBe(false);
    const state = emptyControl();
    stepControl(state, 5, [{ ...player, position }], CITY.control!, world);
    expect(state.owner).toBe('allies');
    for (const start of [...CITY.control!.allies, ...CITY.control!.enemies])
      expect(nav.plan(start, position)).toBeDefined();
  }
  expect(world.canOccupy({ x: 2, y: 0.03, z: -4 }, 1.8)).toBe(true);
  expect(visible(world, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 1.6, z: -10 })).toBe(
    true,
  );
});

it('takes real shelter after a hit, returns to capturing and bounds route searches', () => {
  const { player, world, nav, directive } = fixture();
  player.position = { x: 0, y: 0.03, z: -4 };
  const enemy = {
    ...structuredClone(player),
    id: 'enemy',
    ally: false,
    position: { x: 2.2, y: 0.03, z: -12 },
  };
  let plans = 0;
  const counted = {
    ...nav,
    plan: (...args: Parameters<typeof nav.plan>) => {
      plans++;
      return nav.plan(...args);
    },
  };
  const brain = createBotBrain(1);
  brain.update(player, [enemy], world, counted, 'normal', 1 / 60, 0, {
    directive,
  });
  player.health -= 20;
  brain.update(player, [enemy], world, counted, 'normal', 1 / 60, 1, {
    directive,
  });
  expect(brain.intent().state).toBe('cover');
  const shelter = brain.intent().destination!;
  expect(shelter).toBeDefined();
  expect(
    visible(
      world,
      { ...shelter, y: shelter.y + 1.6 },
      { ...enemy.position, y: enemy.position.y + 1 },
    ),
  ).toBe(false);
  let captured = false;
  let reachedShelter = false;
  for (let tick = 2; tick < 902; tick++) {
    const decision = brain.update(
      player,
      [],
      world,
      counted,
      'normal',
      1 / 60,
      tick,
      { directive },
    );
    Object.assign(
      player,
      predictPlayerMovement(player, decision.input, 1 / 60, world),
    );
    if (
      brain.intent().state === 'cover' &&
      Math.hypot(player.position.x - shelter.x, player.position.z - shelter.z) <
        0.9 &&
      !visible(
        world,
        { ...player.position, y: player.position.y + 1.6 },
        { ...enemy.position, y: enemy.position.y + 1 },
      )
    )
      reachedShelter = true;
    if (tick > 400) {
      const state = emptyControl();
      stepControl(state, 5, [player], CITY.control!, world);
      captured ||= state.owner === 'allies';
    }
  }
  expect(captured).toBe(true);
  expect(reachedShelter).toBe(true);
  expect(brain.intent().state).not.toBe('cover');
  expect(plans).toBeLessThan(35);
});
