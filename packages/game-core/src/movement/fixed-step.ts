export function createFixedStepper(tickRate: number, maxFrameSeconds = 0.25) {
  const dt = 1 / tickRate;
  let accumulator = 0;
  return {
    advance(frameSeconds: number, step: (dt: number) => void): number {
      if (!Number.isFinite(frameSeconds) || frameSeconds < 0)
        return accumulator / dt;
      accumulator += Math.min(frameSeconds, maxFrameSeconds);
      while (accumulator + 1e-10 >= dt) {
        step(dt);
        accumulator = Math.max(0, accumulator - dt);
      }
      return accumulator / dt;
    },
    reset() {
      accumulator = 0;
    },
  };
}
