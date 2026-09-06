import { visible } from '../bots/brain.js';
import { challengeInput } from '../training/challenges.js';
import type {
  GameSnapshot,
  InputCommand,
  PlayerSnapshot,
  Vec3,
} from '@fps/protocol';
import { TICK_RATE } from '@fps/protocol';
import { createCollisionWorld } from '../movement/collision-world.js';
import type { MapDefinition } from '../maps/arena.js';
import { predictPlayerMovement } from '../movement/controller.js';
import { WEAPONS, FIREARMS, equippedWeapon } from '../combat/weapons.js';

export function createPrediction(map: MapDefinition) {
  const world = createCollisionWorld(map);
  let state: PlayerSnapshot | undefined;
  let pending: InputCommand[] = [];
  let active = true;
  const apply = (
    player: PlayerSnapshot,
    command: InputCommand,
  ): PlayerSnapshot => ({
    ...player,
    ...predictPlayerMovement(
      player,
      challengeInput(player, command),
      1 / TICK_RATE,
      world,
      WEAPONS[player.weapon].speed,
      FIREARMS[equippedWeapon(player)].aimSeconds,
    ),
  });
  return {
    hasSight(from: Vec3, to: Vec3) {
      return visible(world, from, to);
    },
    reconcile(authoritative: PlayerSnapshot, canMove = true) {
      active = canMove;
      if (
        state?.id !== authoritative.id ||
        state.lifeId !== authoritative.lifeId ||
        !active ||
        authoritative.health <= 0
      )
        pending = [];
      else
        pending = pending.filter(
          (input) => input.seq > authoritative.lastProcessedInput,
        );
      state = structuredClone(authoritative);
      for (const input of pending) state = apply(state, input);
    },
    push(input: InputCommand) {
      if (
        !state ||
        !active ||
        state.health <= 0 ||
        !state.connected ||
        pending.length >= 120
      )
        return;
      pending.push(structuredClone(input));
      state = apply(state, input);
    },
    state() {
      return state && structuredClone(state);
    },
    get pendingCount() {
      return pending.length;
    },
    reset() {
      state = undefined;
      pending = [];
    },
    dispose() {
      world.dispose();
      pending = [];
      state = undefined;
    },
  };
}

/** Presentation only: never interpolate between lives or extrapolate through walls. */
export function interpolateSnapshots(
  older: GameSnapshot,
  newer: GameSnapshot,
  tick: number,
): GameSnapshot {
  const alpha = Math.max(
    0,
    Math.min(1, (tick - older.tick) / Math.max(1, newer.tick - older.tick)),
  );
  return {
    ...newer,
    players: newer.players.map((player) => {
      const previous = older.players.find((p) => p.id === player.id);
      if (
        !previous ||
        previous.lifeId !== player.lifeId ||
        previous.health <= 0 ||
        player.health <= 0
      )
        return structuredClone(player);
      const position = { ...player.position };
      for (const axis of ['x', 'y', 'z'] as const)
        position[axis] =
          previous.position[axis] +
          (player.position[axis] - previous.position[axis]) * alpha;
      const angle = Math.atan2(
        Math.sin(player.yaw - previous.yaw),
        Math.cos(player.yaw - previous.yaw),
      );
      return { ...player, position, yaw: previous.yaw + angle * alpha };
    }),
  };
}
