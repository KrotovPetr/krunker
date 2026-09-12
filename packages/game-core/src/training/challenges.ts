import type {
  ChallengeSnapshot,
  ChallengeResult,
  GameEvent,
  InputCommand,
  PlayerSnapshot,
  Vec3,
} from '@fps/protocol';
import type { MapDefinition } from '../maps/arena.js';
import { EMPTY_BUTTONS } from '../movement/controller.js';

export const TRAINING_SECONDS = 30;
export const PARKOUR_SECONDS = 120;
export const CHALLENGE_COUNTDOWN = 3;
export const PARKOUR_START: Vec3 = { x: -20, y: 0.03, z: 10 };
export const PARKOUR_CHECKPOINTS: readonly Vec3[] = [
  { x: -20, y: 0.03, z: 0 },
  { x: -24, y: 0.03, z: -11 },
  { x: -23.5, y: 0.15, z: -17 },
  { x: -10, y: 3.03, z: -17 },
  { x: 8, y: 3.03, z: -17 },
  { x: 21, y: 0.03, z: -10 },
  { x: 21, y: 0.03, z: 10 },
  { x: 23.5, y: 0.15, z: 17 },
  { x: 8, y: 3.03, z: 17 },
  { x: -8, y: 3.03, z: 17 },
  PARKOUR_START,
];
export const COURSE_VERSION = 'switchyard-v2';
export function emptyChallenge(runId = 0): ChallengeSnapshot {
  return {
    kind: 'training',
    status: 'idle',
    runId,
    elapsed: 0,
    remaining: 0,
    duration: 0,
    shots: 0,
    hits: 0,
    headshots: 0,
    reactionMs: 0,
    checkpoint: 0,
    targetIndex: -1,
    targetTick: 0,
    weapon: 'rifle',
  };
}
export function challengeActive(c: ChallengeSnapshot) {
  return c.status === 'countdown' || c.status === 'running';
}
export function challengeInput(
  player: PlayerSnapshot,
  input: InputCommand,
): InputCommand {
  if (player.slot === 'knife' && input.aiming)
    input = { ...input, aiming: false };
  const c = player.challenge;
  return c.status === 'countdown' ||
    (c.kind === 'training' && c.status === 'running')
    ? { ...input, buttons: EMPTY_BUTTONS }
    : input;
}
export function movingTargets(map: MapDefinition, tick: number, tickRate = 60) {
  const seconds = tick / tickRate;
  return (map.practice?.targets ?? []).map((target, i) => ({
    id: target.id,
    position: {
      x: target.position.x + Math.sin(seconds * 1.8 + i * 2) * 0.65,
      y: target.position.y + 0.22 * (1 + Math.sin(seconds * 2.1 + i)),
      z: target.position.z,
    },
  }));
}
export function challengeResult(c: ChallengeSnapshot): ChallengeResult {
  return {
    kind: c.kind,
    runId: c.runId,
    elapsed: c.elapsed,
    duration: c.duration,
    shots: c.shots,
    hits: c.hits,
    headshots: c.headshots,
    reactionMs: c.reactionMs,
    weapon: c.weapon,
    course: COURSE_VERSION,
  };
}
export function advanceChallenge(
  player: PlayerSnapshot,
  dt: number,
  tick: number,
  targetCount: number,
): GameEvent[] {
  const c = player.challenge;
  const events: GameEvent[] = [];
  if (!challengeActive(c)) return events;
  if (!player.connected || !player.ready) {
    c.status = 'failed';
    c.targetIndex = -1;
    return events;
  }
  c.remaining = Math.max(0, c.remaining - dt);
  if (c.status === 'countdown') {
    if (c.remaining < 1e-8) {
      c.status = 'running';
      c.remaining = c.duration;
      c.targetTick = tick;
      if (c.kind === 'training' && targetCount)
        c.targetIndex = c.runId % targetCount;
    }
    return events;
  }
  c.elapsed = Math.min(c.duration, c.elapsed + dt);
  if (
    c.kind === 'training' &&
    c.targetIndex < 0 &&
    tick >= c.targetTick &&
    targetCount
  )
    c.targetIndex = (c.runId + c.hits) % targetCount;
  if (c.kind === 'parkour') {
    const point = PARKOUR_CHECKPOINTS[c.checkpoint];
    if (
      point &&
      Math.hypot(point.x - player.position.x, point.z - player.position.z) <
        1.4 &&
      Math.abs(point.y - player.position.y) < 0.85
    ) {
      c.checkpoint++;
      events.push({
        type: 'checkpoint',
        playerId: player.id,
        index: c.checkpoint,
      });
    }
  }
  if (c.kind === 'parkour' && c.checkpoint === PARKOUR_CHECKPOINTS.length)
    c.status = 'finished';
  else if (c.remaining < 1e-8)
    c.status = c.kind === 'training' ? 'finished' : 'failed';
  if (c.status === 'finished')
    events.push({
      type: 'challengeFinished',
      playerId: player.id,
      result: challengeResult(c),
    });
  if (!challengeActive(c)) c.targetIndex = -1;
  return events;
}
export function recordTrainingHit(
  c: ChallengeSnapshot,
  headshot: boolean,
  tick: number,
  tickRate: number,
) {
  if (c.kind !== 'training' || c.status !== 'running' || c.targetIndex < 0)
    return;
  const reaction = (Math.max(0, tick - c.targetTick) / tickRate) * 1000;
  c.reactionMs = (c.reactionMs * c.hits + reaction) / (c.hits + 1);
  c.hits++;
  if (headshot) c.headshots++;
  c.targetIndex = -1;
  c.targetTick = tick + Math.ceil((0.4 + (c.hits % 4) * 0.15) * tickRate);
}
