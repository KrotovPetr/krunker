import { expect, test } from '@playwright/test';

for (const [mapId, quality, mode = 'bots'] of [
  ['bastion', 'low', 'control'],
  ['bastion', 'low', 'mission'],
  ['bastion', 'medium'],
  ['bastion', 'low'],
  ['switchyard', 'medium'],
  ['switchyard', 'low'],
  ['sandgate', 'medium'],
  ['sandgate', 'low'],
  ['spillway', 'medium'],
  ['spillway', 'low'],
] as const) {
  test(
    mapId +
      ' ' +
      quality +
      ' ' +
      mode +
      ' firefight stays within the CPU frame budget',
    async ({ page }, info) => {
      await page.addInitScript(() => {
        const samples: { work: number; interval: number }[] = [];
        let previous = 0;
        const original = requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (callback) =>
          original((time) => {
            const start = performance.now();
            callback(time);
            if (previous)
              samples.push({
                work: performance.now() - start,
                interval: time - previous,
              });
            previous = time;
            if (samples.length > 2000) samples.shift();
          });
        Object.assign(window, { frameSamples: samples });
      });
      await page.goto('/');
      await page.locator('#nickname').fill('Perf');
      await page.locator('#join').click();
      await expect(page.locator('#play')).toBeEnabled();
      await page.locator('#graphics-quality').selectOption(quality);
      await page.locator('#map-select').selectOption(mapId);
      await page.locator('#mode-select').selectOption(mode);
      await page.locator('#bot-count').selectOption('5');
      await page.locator('#play').click();
      await expect(page.locator('#app')).toHaveClass(/playing/);
      await page.waitForTimeout(2500);
      await page.evaluate(() => {
        (window as unknown as { frameSamples: unknown[] }).frameSamples.length =
          0;
      });
      await page.mouse.down();
      await page.waitForTimeout(8000);
      await page.mouse.up();
      const result = await page.evaluate(() => {
        const samples = (
          window as unknown as {
            frameSamples: { work: number; interval: number }[];
          }
        ).frameSamples;
        const percentile = (key: 'work' | 'interval', p: number) =>
          samples.map((s) => s[key]).sort((a, b) => a - b)[
            Math.floor((samples.length - 1) * p)
          ]!;
        return {
          frames: samples.length,
          workP50: percentile('work', 0.5),
          workP95: percentile('work', 0.95),
          workMax: percentile('work', 1),
          intervalP95: percentile('interval', 0.95),
          fps:
            1000 /
            (samples.reduce((n, s) => n + s.interval, 0) / samples.length),
        };
      });
      await info.attach('frame-metrics', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });
      console.log(JSON.stringify({ mapId, quality, mode, ...result }));
      expect(result.frames).toBeGreaterThan(60);
      expect(result.workP95).toBeLessThan(16.7);
      await page.keyboard.press('Escape');
      await page.locator('#leave').click();
    },
  );
}
