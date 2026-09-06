import { expect, it } from 'vitest';
import { isEnemy } from './enemy-markers.js';
import type { GameSnapshot, PlayerSnapshot } from '@fps/protocol';
it('marks opponents only, including PvP enemies but excluding dead, disconnected and allied players', () => {
  const p = {
    id: 'enemy',
    bot: true,
    ready: true,
    connected: true,
    health: 100,
  } as PlayerSnapshot;
  const s = { mode: 'waves', phase: 'active' } as GameSnapshot;
  expect(isEnemy(s, p, 'me')).toBe(true);
  for (const changes of [
    { health: 0 },
    { connected: false },
    { ready: false },
    { bot: false },
    { ally: true },
    { id: 'me' },
  ])
    expect(isEnemy(s, { ...p, ...changes }, 'me')).toBe(false);
  expect(isEnemy({ ...s, mode: 'arena' }, { ...p, bot: false }, 'me')).toBe(
    true,
  );
  expect(isEnemy({ ...s, phase: 'waiting' }, p, 'me')).toBe(false);
});
