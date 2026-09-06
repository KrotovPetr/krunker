import { describe, expect, it } from 'vitest';
import {
  clientCommandSchema,
  joinOptionsSchema,
  nicknameSchema,
  PROTOCOL_VERSION,
} from './index.js';

describe('client protocol', () => {
  it('normalizes names before checking their visible length', () => {
    expect(nicknameSchema.parse('  Ｐilot\u0000   One  ')).toBe('Pilot One');
  });
  it.each(['', '   ', '\u200b', 'x'.repeat(21)])(
    'rejects invalid nickname %j',
    (nickname) => {
      expect(nicknameSchema.safeParse(nickname).success).toBe(false);
    },
  );
  it('requires the expected protocol and rejects unknown join options', () => {
    expect(
      joinOptionsSchema.safeParse({
        nickname: 'Pilot',
        protocolVersion: PROTOCOL_VERSION,
      }).success,
    ).toBe(true);
    expect(
      joinOptionsSchema.safeParse({ nickname: 'Pilot', protocolVersion: 999 })
        .success,
    ).toBe(false);
    expect(
      joinOptionsSchema.safeParse({
        nickname: 'Pilot',
        protocolVersion: PROTOCOL_VERSION,
        admin: true,
      }).success,
    ).toBe(false);
  });
  it.each([
    { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0, damage: 100 },
    { type: 'fire', inputSeq: 0, yaw: Infinity, pitch: 0 },
    { type: 'fire', inputSeq: -1, yaw: 0, pitch: 0 },
    { type: 'fire', inputSeq: 0, yaw: 0, pitch: Math.PI },
    { type: 'selectSlot', slot: 'rocket' },
    { type: 'fire', inputSeq: 0, yaw: 0, pitch: 0, aimProgress: 1 },
    { type: 'teleport', x: 100, y: 100, z: 100 },
    { type: 'reload', position: { x: 100, y: 0, z: 0 } },
    { type: 'ready', ready: 'yes' },
    { type: 'setBots', count: 500, difficulty: 'hard' },
    { type: 'setBots', count: 2, difficulty: 'aimbot' },
    { type: 'setMode', mode: 'admin' },
    { type: 'setMap', mapId: 'unknown' },
    { type: 'setMap', mapId: 'bastion', blocks: [] },
    { type: 'startChallenge', elapsed: 0.1, hits: 100 },
  ])('rejects invalid or authoritative client data %j', (command) => {
    expect(clientCommandSchema.safeParse(command).success).toBe(false);
  });
  it('accepts intent-only input', () => {
    expect(
      clientCommandSchema.safeParse({
        type: 'input',
        seq: 3,
        yaw: 0,
        pitch: 0,
        buttons: {
          forward: true,
          back: false,
          left: false,
          right: false,
          jump: false,
          crouch: false,
        },
      }).success,
    ).toBe(true);
  });
});
