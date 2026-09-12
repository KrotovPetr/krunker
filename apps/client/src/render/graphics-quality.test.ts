import { describe, expect, it } from 'vitest';
import {
  GRAPHICS_QUALITY_STORAGE_KEY,
  loadGraphicsQuality,
  resolveGraphicsProfile,
  saveGraphicsQuality,
} from './graphics-quality.js';

describe('graphics quality', () => {
  it('uses the low profile for constrained devices in auto mode', () => {
    expect(resolveGraphicsProfile('auto', 2, 4, 4)).toEqual({
      pixelRatio: 0.75,
      shadows: false,
      shadowMapSize: 512,
      mapDetails: 'reduced',
    });
  });

  it('caps balanced and high profiles by the device pixel ratio', () => {
    expect(resolveGraphicsProfile('medium', 3, 12, 16).pixelRatio).toBe(1);
    expect(resolveGraphicsProfile('high', 1.5, 12, 16).pixelRatio).toBe(1.5);
    expect(resolveGraphicsProfile('auto', 2, 12, 16).shadowMapSize).toBe(1024);
  });

  it('loads only supported stored values and tolerates denied storage', () => {
    expect(loadGraphicsQuality({ getItem: () => 'low' })).toBe('low');
    expect(loadGraphicsQuality({ getItem: () => 'ultra' })).toBe('auto');
    expect(
      loadGraphicsQuality({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toBe('auto');
  });

  it('saves the setting when storage is available', () => {
    const saved = new Map<string, string>();
    saveGraphicsQuality(
      { setItem: (key, value) => saved.set(key, value) },
      'medium',
    );
    expect(saved.get(GRAPHICS_QUALITY_STORAGE_KEY)).toBe('medium');
  });
});
