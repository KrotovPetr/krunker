import type {
  ControlSnapshot,
  PlayerSnapshot,
  SquadOrderSnapshot,
} from '@fps/protocol';
import type { MapDefinition } from '../maps/arena.js';
import type { CollisionWorld } from '../movement/collision-world.js';
import { visible } from '../bots/navigation.js';

export const CONTROL = {
  captureSeconds: 5,
  scoreToWin: 90,
  roundSeconds: 180,
} as const;
export const emptyControl = (): ControlSnapshot => ({
  progress: 0,
  owner: 'neutral',
  contested: false,
  allies: 0,
  enemies: 0,
  allyScore: 0,
  enemyScore: 0,
});
export const emptySquadOrder = (serial = 0): SquadOrderSnapshot => ({
  kind: 'auto',
  commanderId: '',
  position: { x: 0, y: 0, z: 0 },
  remaining: 0,
  serial,
});

/** Capturing is authoritative, independent of frame rate and capped at one team rate. */
export function stepControl(
  state: ControlSnapshot,
  dt: number,
  players: readonly PlayerSnapshot[],
  point: NonNullable<MapDefinition['control']>,
  world: CollisionWorld,
) {
  const previousProgress = state.progress;
  const previousOwner = state.owner;
  state.allies = state.enemies = 0;
  for (const player of players) {
    if (
      !player.ready ||
      !player.connected ||
      player.health <= 0 ||
      player.protectionRemaining > 0 ||
      Math.abs(player.position.y - point.position.y) > 1 ||
      Math.hypot(
        player.position.x - point.position.x,
        player.position.z - point.position.z,
      ) > point.radius ||
      !visible(
        world,
        { ...point.position, y: point.position.y + 0.6 },
        { ...player.position, y: player.position.y + 0.6 },
      )
    )
      continue;
    if (player.bot && !player.ally) state.enemies++;
    else state.allies++;
  }
  state.contested = state.allies > 0 && state.enemies > 0;
  if (state.contested) return;
  const direction = state.allies ? 1 : state.enemies ? -1 : 0;
  if (direction) {
    state.progress = Math.max(
      -1,
      Math.min(1, state.progress + (direction * dt) / CONTROL.captureSeconds),
    );
    if (Math.abs(state.progress) < 1e-8) state.progress = 0;
    if (
      (state.owner === 'allies' && state.progress <= 0) ||
      (state.owner === 'enemies' && state.progress >= 0)
    )
      state.owner = 'neutral';
    if (state.progress >= 1 - 1e-8) {
      state.progress = 1;
      state.owner = 'allies';
    }
    if (state.progress <= -1 + 1e-8) {
      state.progress = -1;
      state.owner = 'enemies';
    }
  }
  // Vacant owned points score; enemy presence interrupts scoring immediately.
  if (state.owner === 'allies' && !state.enemies)
    state.allyScore = Math.min(
      CONTROL.scoreToWin,
      state.allyScore +
        (previousOwner === 'allies'
          ? dt
          : Math.max(0, dt - (1 - previousProgress) * CONTROL.captureSeconds)),
    );
  if (state.owner === 'enemies' && !state.allies)
    state.enemyScore = Math.min(
      CONTROL.scoreToWin,
      state.enemyScore +
        (previousOwner === 'enemies'
          ? dt
          : Math.max(0, dt - (1 + previousProgress) * CONTROL.captureSeconds)),
    );
}
