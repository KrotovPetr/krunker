/** Automatic GPU relief. Does not change physics, visibility or user-selected
 * manual profiles. Monotonic per selection prevents resolution oscillation. */
export function createAdaptiveQuality() {
  let level = 0,
    warmup = 3,
    duration = 0,
    samples = 0,
    slow = 0;
  const scales = [1, 0.85, 0.7, 0.55] as const;
  const clearWindow = () => {
    duration = samples = slow = 0;
  };
  return {
    get level() {
      return level;
    },
    get scale() {
      return scales[level]!;
    },
    reset() {
      level = 0;
      warmup = 3;
      clearWindow();
    },
    sample(dt: number, active: boolean): number | undefined {
      if (!active || !Number.isFinite(dt) || dt <= 0 || dt >= 0.25) {
        warmup = 3;
        clearWindow();
        return;
      }
      if (warmup > 0) {
        warmup -= dt;
        return;
      }
      duration += dt;
      samples++;
      if (dt > 0.022) slow++;
      if (duration < 3) return;
      const overloaded = samples >= 30 && slow / samples > 0.35;
      clearWindow();
      if (!overloaded || level === scales.length - 1) return;
      level++;
      warmup = 3;
      return scales[level];
    },
  };
}
