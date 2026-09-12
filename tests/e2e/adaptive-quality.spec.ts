import { expect, test } from '@playwright/test';

test('auto reduces render resolution after sustained slow frames and respects manual quality', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Gameplay needs working headless pointer lock.',
  );
  await page.addInitScript(() => {
    // Inject frame scheduling delay, not CPU work or fake performance readings.
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      original((time) => {
        setTimeout(() => callback(time), 35);
      });
  });
  await page.goto('/');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#graphics-quality').selectOption('auto');
  await page.locator('#mode-select').selectOption('control');
  await page.locator('#play').click();
  const canvas = page.locator('#scene canvas');
  const initial = Number(await canvas.getAttribute('data-render-scale'));
  await expect(canvas).toHaveAttribute('data-adaptive-level', /^[1-3]$/, {
    timeout: 15000,
  });
  expect(Number(await canvas.getAttribute('data-render-scale'))).toBeLessThan(
    initial,
  );
  await page.keyboard.press('Escape');
  await page.locator('#graphics-quality').selectOption('medium');
  await expect(canvas).toHaveAttribute('data-adaptive-level', '0');
  await expect(canvas).toHaveAttribute('data-render-scale', '1');
  await page.locator('#play').click();
  await page.waitForTimeout(7000);
  await expect(canvas).toHaveAttribute('data-render-scale', '1');
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
});
