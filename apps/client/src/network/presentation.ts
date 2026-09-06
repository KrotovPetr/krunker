import {
  ARENA,
  getMap,
  createPrediction,
  interpolateSnapshots,
} from '@fps/game-core';
import { TICK_RATE } from '@fps/protocol';
import type { GameSnapshot, InputCommand, Vec3 } from '@fps/protocol';

export function createPresentation() {
  let mapId = ARENA.id;
  let prediction = createPrediction(ARENA);
  let frames: GameSnapshot[] = [];
  let localId = '';
  let receivedAt = 0;
  let displayTick = 0;
  let previousPosition: Vec3 | undefined;
  let correction = { x: 0, y: 0, z: 0 };
  return {
    hasSight(from: Vec3, to: Vec3) {
      return prediction.hasSight(from, to);
    },
    receive(snapshot: GameSnapshot, id: string) {
      if (snapshot.mapId !== mapId) {
        prediction.dispose();
        mapId = snapshot.mapId;
        prediction = createPrediction(getMap(mapId));
        frames = [];
        displayTick = 0;
        previousPosition = undefined;
        correction = { x: 0, y: 0, z: 0 };
      }
      localId = id;
      receivedAt = performance.now();
      if (frames.length && snapshot.tick <= frames[frames.length - 1]!.tick)
        return;
      frames.push(snapshot);
      if (frames.length > 16) frames.shift();
      const local = snapshot.players.find((p) => p.id === id);
      if (local) {
        const previous = prediction.state();
        prediction.reconcile(local, snapshot.phase !== 'results');
        const next = prediction.state()!;
        if (
          previous?.lifeId === next.lifeId &&
          previous.health > 0 &&
          next.health > 0
        ) {
          for (const axis of ['x', 'y', 'z'] as const)
            correction[axis] += previous.position[axis] - next.position[axis];
          if (Math.hypot(correction.x, correction.y, correction.z) > 2)
            correction = { x: 0, y: 0, z: 0 };
          if (previousPosition)
            for (const axis of ['x', 'y', 'z'] as const)
              previousPosition[axis] +=
                next.position[axis] - previous.position[axis];
        } else {
          correction = { x: 0, y: 0, z: 0 };
          previousPosition = { ...next.position };
        }
      }
    },
    input(command: InputCommand) {
      previousPosition = prediction.state()?.position;
      prediction.push(command);
    },
    get viewTick() {
      return Math.max(0, Math.floor(displayTick));
    },
    frame(dt: number, alpha = 1): GameSnapshot | undefined {
      const latest = frames[frames.length - 1];
      if (!latest) return;
      const targetTick =
        latest.tick +
        Math.min(0.1, (performance.now() - receivedAt) / 1000) * TICK_RATE -
        6;
      displayTick = Math.max(displayTick, targetTick);
      let older = frames[0]!,
        newer = latest;
      for (const frame of frames) {
        if (frame.tick <= displayTick) older = frame;
        if (frame.tick >= displayTick) {
          newer = frame;
          break;
        }
      }
      const snapshot = interpolateSnapshots(older, newer, displayTick);
      snapshot.tick = Math.max(0, displayTick);
      const local = prediction.state();
      if (local) {
        for (const axis of ['x', 'y', 'z'] as const) {
          correction[axis] *= Math.exp(-dt * 18);
          if (previousPosition)
            local.position[axis] =
              previousPosition[axis] +
              (local.position[axis] - previousPosition[axis]) * alpha;
          local.position[axis] += correction[axis];
        }
        snapshot.players = snapshot.players.map((p) =>
          p.id === localId ? local : p,
        );
      }
      return snapshot;
    },
    reset() {
      prediction.reset();
      previousPosition = undefined;
      frames = [];
      displayTick = 0;
      correction = { x: 0, y: 0, z: 0 };
    },
    dispose() {
      prediction.dispose();
      frames = [];
    },
  };
}
