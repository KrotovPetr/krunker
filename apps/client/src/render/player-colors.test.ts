import { expect, it } from 'vitest';
import { playerColor } from './player-colors.js';
it('assigns eight distinct member colors per team with disjoint palettes', () => {
  const a = Array.from({ length: 8 }, (_, i) => playerColor(i, true));
  const b = Array.from({ length: 8 }, (_, i) => playerColor(i, false));
  expect(new Set(a).size).toBe(8);
  expect(new Set(b).size).toBe(8);
  expect(a.some((c) => b.includes(c))).toBe(false);
  expect(playerColor(2, true)).toBe(a[2]);
});
