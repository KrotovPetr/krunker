import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ARENA,
  createGame,
  DEFAULT_CONFIG,
  EMPTY_BUTTONS,
  initializePhysics,
  movingTargets,
  PARKOUR_CHECKPOINTS,
  createCollisionWorld,
} from '../index.js';
import type { Game } from '../index.js';
import type { ClientCommand, GameEvent } from '@fps/protocol';
import {
  advanceChallenge,
  emptyChallenge,
  recordTrainingHit,
} from './challenges.js';
import { createNavigation, visible } from '../bots/brain.js';

beforeAll(initializePhysics);
const games: Game[] = [];
afterEach(() => games.splice(0).forEach((g) => g.dispose()));
const cmd = (g: Game, command: ClientCommand, playerId = 'human') =>
  g.enqueue({ type: 'playerCommand', playerId, command });
const step = (g: Game, n = 1) => {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(1 / 60));
  return events;
};
const local = (g: Game) => g.snapshot().players.find((p) => p.id === 'human')!;
function setup(mode: 'training' | 'parkour' | 'bots' | 'arena' = 'training') {
  const g = createGame(
    {
      ...DEFAULT_CONFIG,
      protectionSeconds: 0,
      trainingSeconds: 2,
      challengeCountdown: 0.1,
    },
    ARENA,
    0,
  );
  games.push(g);
  g.enqueue({ type: 'join', playerId: 'human', nickname: 'Human' });
  cmd(g, { type: 'setMode', mode });
  step(g, 2);
  return g;
}

describe('range challenges', () => {
  it('uses deterministic moving positions bounded to the range', () => {
    expect(movingTargets(ARENA, 100)).toEqual(movingTargets(ARENA, 100));
    expect(movingTargets(ARENA, 100)).not.toEqual(movingTargets(ARENA, 200));
    for (let tick = 0; tick < 1000; tick += 10)
      movingTargets(ARENA, tick).forEach((target, i) => {
        expect(
          Math.abs(target.position.x - ARENA.practice!.targets[i]!.position.x),
        ).toBeLessThanOrEqual(0.65);
        expect(target.position.y).toBeGreaterThanOrEqual(0.03);
      });
  });
  it('never starts PvP with two ready trainees and freezes movement only during the attempt', () => {
    const g = setup();
    g.enqueue({ type: 'join', playerId: 'other', nickname: 'Other' });
    cmd(g, { type: 'ready', ready: true }, 'other');
    cmd(g, { type: 'startChallenge' });
    step(g, 7);
    const start = local(g).position;
    cmd(g, {
      type: 'input',
      seq: 1,
      yaw: 0,
      pitch: 0,
      buttons: { ...EMPTY_BUTTONS, forward: true, jump: true },
    });
    cmd(g, { type: 'selectWeapon', weapon: 'sniper' });
    cmd(g, { type: 'selectSlot', slot: 'secondary' });
    step(g, 30);
    expect(g.snapshot().phase).toBe('waiting');
    expect(local(g).position.x).toBeCloseTo(start.x);
    expect(local(g).position.z).toBeCloseTo(start.z);
    expect(local(g).weapon).toBe('rifle');
    expect(local(g).slot).toBe('primary');
    const events = step(g, 120).filter((e) => e.type === 'challengeFinished');
    expect(events).toHaveLength(1);
    expect(local(g).challenge.status).toBe('finished');
    expect(local(g).challenge.elapsed).toBeCloseTo(2);
    expect(step(g, 60).some((e) => e.type === 'challengeFinished')).toBe(false);
    cmd(g, { type: 'startChallenge' });
    step(g);
    expect(local(g).challenge.runId).toBe(2);
    expect(local(g).challenge.shots).toBe(0);
  });
  it('counts accepted shots and one hit per target, records reaction, ignores cooldown spam', () => {
    const g = setup();
    cmd(g, { type: 'selectWeapon', weapon: 'sniper' });
    cmd(g, { type: 'startChallenge' });
    step(g, 30);
    const p = local(g),
      tick = g.snapshot().tick;
    const target = movingTargets(ARENA, tick)[p.challenge.targetIndex]!;
    const dx = target.position.x - p.position.x,
      dz = target.position.z - p.position.z;
    const yaw = Math.atan2(-dx, -dz),
      pitch = Math.atan2(
        target.position.y + 1 - (p.position.y + 1.65),
        Math.hypot(dx, dz),
      );
    for (let i = 1; i <= 18; i++) {
      cmd(g, {
        type: 'input',
        seq: i,
        yaw,
        pitch,
        aiming: true,
        buttons: EMPTY_BUTTONS,
      });
      step(g);
    }
    const now = g.snapshot().tick,
      updated = movingTargets(ARENA, now)[local(g).challenge.targetIndex]!;
    const aim = {
      yaw: Math.atan2(-(updated.position.x - p.position.x), -dz),
      pitch: Math.atan2(
        updated.position.y + 1 - (local(g).position.y + 1.65),
        Math.hypot(updated.position.x - p.position.x, dz),
      ),
    };
    for (let i = 0; i < 4; i++)
      cmd(g, { type: 'fire', inputSeq: 18, ...aim, viewTick: now });
    const events = step(g);
    expect(events.filter((e) => e.type === 'shot')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'practiceHit')).toHaveLength(1);
    expect(local(g).challenge).toMatchObject({
      shots: 1,
      hits: 1,
      targetIndex: -1,
    });
    expect(local(g).challenge.reactionMs).toBeGreaterThan(500);
    expect(local(g).kills).toBe(0);
    expect(local(g).health).toBe(90);
  });
  it('counts a shotgun trigger once and cannot count the same target twice', () => {
    const c = {
      ...emptyChallenge(),
      status: 'running' as const,
      shots: 1,
      targetIndex: 0,
      targetTick: 10,
    };
    recordTrainingHit(c, true, 40, 60);
    recordTrainingHit(c, true, 40, 60);
    expect(c.hits).toBe(1);
    expect(c.headshots).toBe(1);
    expect(c.reactionMs).toBe(500);
  });
  it('fails interrupted attempts and rejects fire during countdown', () => {
    const g = setup();
    cmd(g, { type: 'startChallenge' });
    cmd(g, { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0 });
    expect(step(g).some((e) => e.type === 'shot')).toBe(false);
    g.enqueue({ type: 'connection', playerId: 'human', connected: false });
    step(g);
    expect(local(g).challenge.status).toBe('failed');
  });
});

describe('parkour', () => {
  it('checks order and height, finishes once and times out without awarding a record', () => {
    const g = setup('parkour');
    cmd(g, { type: 'startChallenge' });
    step(g, 7);
    const p = local(g);
    p.position = { ...PARKOUR_CHECKPOINTS[2]! };
    advanceChallenge(p, 1 / 60, 8, 3);
    expect(p.challenge.checkpoint).toBe(0);
    p.position = { ...PARKOUR_CHECKPOINTS[0]!, y: 4 };
    advanceChallenge(p, 1 / 60, 9, 3);
    expect(p.challenge.checkpoint).toBe(0);
    const events: GameEvent[] = [];
    for (const point of PARKOUR_CHECKPOINTS) {
      p.position = { ...point };
      events.push(...advanceChallenge(p, 1 / 60, 10, 3));
    }
    expect(p.challenge.status).toBe('finished');
    expect(events.filter((e) => e.type === 'challengeFinished')).toHaveLength(
      1,
    );
    expect(advanceChallenge(p, 1 / 60, 11, 3)).toEqual([]);
    p.challenge.status = 'running';
    p.challenge.checkpoint = 0;
    p.challenge.remaining = 0.01;
    expect(
      advanceChallenge(p, 1 / 60, 12, 3).some(
        (e) => e.type === 'challengeFinished',
      ),
    ).toBe(false);
    expect(p.challenge.status).toBe('failed');
  });
  it('can traverse every checkpoint using actual movement and collision, with no shooting', () => {
    const g = setup('parkour');
    cmd(g, { type: 'startChallenge' });
    step(g, 7);
    cmd(g, { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0 });
    expect(step(g).some((e) => e.type === 'shot')).toBe(false);
    let seq = 1;
    for (
      let i = 0;
      i < 60 * 80 && local(g).challenge.status === 'running';
      i++
    ) {
      const p = local(g),
        point = PARKOUR_CHECKPOINTS[p.challenge.checkpoint]!;
      const yaw = Math.atan2(
        -(point.x - p.position.x),
        -(point.z - p.position.z),
      );
      cmd(g, {
        type: 'input',
        seq: seq++,
        yaw,
        pitch: 0,
        buttons: { ...EMPTY_BUTTONS, forward: true, jump: i % 90 === 0 },
      });
      step(g);
    }
    expect(
      local(g).challenge.checkpoint,
      JSON.stringify(local(g).position),
    ).toBe(PARKOUR_CHECKPOINTS.length);
    expect(local(g).challenge.status).toBe('finished');
  });
});

describe('bot matches and host controls', () => {
  it('starts with one human and bots move, fire, kill and respawn using core combat', () => {
    const g = setup('bots');
    cmd(g, { type: 'ready', ready: true });
    step(g, 2);
    expect(g.snapshot().phase).toBe('active');
    expect(g.snapshot().players.filter((p) => p.bot)).toHaveLength(3);
    const start = g.snapshot().players.find((p) => p.bot)!.position;
    const events = step(g, 1800);
    expect(g.snapshot().players.find((p) => p.bot)!.position).not.toEqual(
      start,
    );
    expect(
      events.some((e) => e.type === 'shot' && e.playerId.startsWith('bot:')),
    ).toBe(true);
    expect(events.some((e) => e.type === 'kill')).toBe(true);
    expect(events.some((e) => e.type === 'respawn')).toBe(true);
    expect(g.snapshot().players.every((p) => p.position.y > -1)).toBe(true);
  });
  it('protects host settings, transfers host and removes bots when mode changes or humans leave', () => {
    const g = setup('bots');
    g.enqueue({ type: 'join', playerId: 'other', nickname: 'Other' });
    step(g);
    cmd(g, { type: 'setMode', mode: 'parkour' }, 'other');
    expect(step(g)).toContainEqual({
      type: 'commandRejected',
      playerId: 'other',
      reason: 'hostOnly',
    });
    g.enqueue({ type: 'leave', playerId: 'human' });
    step(g);
    expect(g.snapshot().hostId).toBe('other');
    cmd(g, { type: 'setMode', mode: 'parkour' }, 'other');
    step(g);
    expect(g.snapshot().players.some((p) => p.bot)).toBe(false);
    cmd(g, { type: 'setMode', mode: 'bots' }, 'other');
    step(g, 2);
    g.enqueue({ type: 'leave', playerId: 'other' });
    step(g, 2);
    expect(g.snapshot().players).toHaveLength(0);
  });
  it('gives real players room slots occupied by bots', () => {
    const g = setup('bots');
    for (let i = 0; i < 7; i++) {
      g.enqueue({
        type: 'join',
        playerId: `human${i}`,
        nickname: `Player${i}`,
      });
      step(g, 2);
    }
    expect(g.snapshot().players).toHaveLength(8);
    expect(g.snapshot().players.every((p) => !p.bot)).toBe(true);
  });
  it('builds a route around the central solid instead of seeing through it', () => {
    const world = createCollisionWorld(ARENA);
    try {
      expect(
        visible(world, { x: -15, y: 1, z: -5 }, { x: -4, y: 1, z: -5 }),
      ).toBe(false);
      const navigation = createNavigation(ARENA, world);
      const path = navigation.path(
        { x: -21, y: 0, z: 0 },
        { x: 21, y: 0, z: 0 },
      );
      expect(path.length).toBeGreaterThan(5);
      expect(path.every((p) => world.canOccupy(p, 1.8))).toBe(true);
    } finally {
      world.dispose();
    }
  });
});
