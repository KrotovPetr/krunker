import { expect, it } from 'vitest';
import type { WaveSnapshot } from '@fps/protocol';
import { summarizeEnemyWave } from './enemy-roster.js';

const wave: WaveSnapshot = {
  number: 3,
  status: 'fighting',
  remaining: 0,
  alive: 3,
  queued: 2,
  total: 8,
  cleared: 2,
  runId: 1,
};

it('groups living enemies by class and keeps wave counts separate', () => {
  const summary = summarizeEnemyWave(
    [
      { bot: true, ally: false, health: 100, weapon: 'rifle' },
      { bot: true, ally: false, health: 40, weapon: 'rifle' },
      { bot: true, ally: false, health: 110, weapon: 'shotgun' },
      { bot: true, ally: false, health: 0, weapon: 'sniper' },
      { bot: true, ally: true, health: 100, weapon: 'lmg' },
      { bot: false, ally: false, health: 100, weapon: 'smg' },
    ],
    wave,
  );
  expect(summary).toEqual({
    remaining: 5,
    active: 3,
    queued: 2,
    defeated: 3,
    classes: [
      { weapon: 'rifle', label: 'АВТ', count: 2 },
      { weapon: 'shotgun', label: 'ДРБ', count: 1 },
    ],
  });
});

it('shows an empty field while the full wave is queued', () => {
  expect(
    summarizeEnemyWave([], { ...wave, status: 'preparing', queued: 8 }),
  ).toMatchObject({
    remaining: 8,
    active: 0,
    queued: 8,
    defeated: 0,
    classes: [],
  });
});
