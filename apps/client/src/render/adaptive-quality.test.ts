import { expect, it } from 'vitest';
import { createAdaptiveQuality } from './adaptive-quality.js';

it('ignores warmup, isolated stalls and hidden or paused tabs', () => {
  const quality = createAdaptiveQuality();
  for (let i = 0; i < 120; i++)
    expect(quality.sample(1 / 30, true)).toBeUndefined();
  quality.sample(2, false);
  for (let i = 0; i < 1000; i++) quality.sample(1 / 60, true);
  quality.sample(0.2, true);
  for (let i = 0; i < 1000; i++) quality.sample(1 / 60, true);
  expect(quality.level).toBe(0);
});
it('reduces resolution only after sustained slow frames, bounds degradation and resets', () => {
  const quality = createAdaptiveQuality();
  for (let i = 0; i < 300; i++) quality.sample(1 / 30, true);
  expect(quality.level).toBeGreaterThan(0);
  for (let i = 0; i < 3000; i++) quality.sample(1 / 30, true);
  expect(quality.level).toBe(3);
  expect(quality.scale).toBe(0.55);
  quality.reset();
  expect(quality.level).toBe(0);
  expect(quality.scale).toBe(1);
});
