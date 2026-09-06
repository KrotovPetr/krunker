import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChallengeResult } from '@fps/protocol';
import { loadRecord, saveRecord } from './records.js';
const base: ChallengeResult = {
  kind: 'training',
  course: 'switchyard-v1',
  runId: 1,
  weapon: 'rifle',
  duration: 30,
  elapsed: 30,
  shots: 10,
  hits: 6,
  headshots: 2,
  reactionMs: 430,
};
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('keeps the best range result per weapon and duration across module calls', () => {
  expect(saveRecord(base).improved).toBe(true);
  expect(saveRecord({ ...base, hits: 3 }).improved).toBe(false);
  expect(loadRecord(base)).toEqual(base);
  expect(loadRecord({ ...base, weapon: 'sniper' })).toBeUndefined();
  expect(loadRecord({ ...base, duration: 6 })).toBeUndefined();
  expect(saveRecord({ ...base, hits: 7 }).improved).toBe(true);
  expect(saveRecord({ ...base, hits: 7, shots: 9 }).improved).toBe(true);
});
it('keeps the fastest parkour run', () => {
  const run = {
    ...base,
    kind: 'parkour' as const,
    elapsed: 40,
    duration: 120,
    shots: 0,
    hits: 0,
    headshots: 0,
  };
  saveRecord(run);
  expect(saveRecord({ ...run, elapsed: 50 }).best.elapsed).toBe(40);
  expect(saveRecord({ ...run, elapsed: 35 }).best.elapsed).toBe(35);
});
it('survives corrupt or disabled storage', () => {
  saveRecord(base);
  const key = [...storage.keys()][0]!;
  storage.set(key, '{broken');
  expect(loadRecord(base)).toBeUndefined();
  storage.set(key, JSON.stringify({ ...base, hits: 500 }));
  expect(loadRecord(base)).toBeUndefined();
  vi.stubGlobal('localStorage', {
    getItem() {
      throw new Error('disabled');
    },
    setItem() {
      throw new Error('disabled');
    },
  });
  expect(() => saveRecord(base)).not.toThrow();
});
