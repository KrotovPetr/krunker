import { expect, test, type Page } from '@playwright/test';

async function walkTo(page: Page, axis: 'x' | 'z', target: number) {
  const coordinate = async () =>
    Number(await page.locator('#movement-hud').getAttribute('data-' + axis));
  const stop = async (key: string) => {
    const tick = Number(
      await page.locator('#movement-hud').getAttribute('data-tick'),
    );
    await page.keyboard.up(key);
    await expect
      .poll(
        async () =>
          Number(await page.locator('#movement-hud').getAttribute('data-tick')),
        { intervals: [30] },
      )
      .toBeGreaterThanOrEqual(tick + 12);
    await expect
      .poll(async () => Number(await page.locator('#speed').textContent()), {
        intervals: [40],
      })
      .toBeLessThan(0.1);
  };
  const initial = target - (await coordinate());
  const keyFor = (delta: number) =>
    axis === 'x' ? (delta > 0 ? 'd' : 'a') : delta > 0 ? 's' : 'w';
  if (Math.abs(initial) > 2) {
    const key = keyFor(initial);
    await page.keyboard.down(key);
    await expect
      .poll(async () => Math.sign(initial) * (target - (await coordinate())), {
        timeout: 9000,
        intervals: [30],
      })
      .toBeLessThan(2);
    await stop(key);
  }
  // Release before the corner, then tap to account for acceleration and braking.
  for (let i = 0; i < 15; i++) {
    const delta = target - (await coordinate());
    if (Math.abs(delta) < 0.25) return;
    const key = keyFor(delta);
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.min(80, Math.max(17, Math.abs(delta) * 40)));
    await stop(key);
  }
  expect(
    Math.abs(target - (await coordinate())),
    axis + ' destination ' + target,
  ).toBeLessThan(0.25);
}

test.beforeEach(async ({ page, browserName }) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in Chromium headless shell remains deferred.',
  );
  await page.goto('/');
  await page.getByLabel('Твой ник').fill('Scout');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#map-select').selectOption('sandgate');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'sandgate',
  );
});
test('walks under the gallery and climbs its north ramp without crouching', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('#map-preview').click();
  await page.screenshot({
    path: test.info().outputPath('sandgate-overview.png'),
  });
  await page.keyboard.press('Escape');
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  const coordinate = async (axis: string) =>
    Number(await page.locator('#movement-hud').getAttribute('data-' + axis));
  await page.screenshot({
    path: test.info().outputPath('sandgate-fountain.png'),
  });
  await walkTo(page, 'x', 14.5);
  await walkTo(page, 'z', 0);
  expect(await coordinate('y')).toBeLessThan(0.2);
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-crouched',
    'false',
  );
  await page.screenshot({
    path: test.info().outputPath('sandgate-arcade.png'),
  });
  await walkTo(page, 'z', -20);
  await walkTo(page, 'x', 17.7);
  await walkTo(page, 'z', -6);
  expect(await coordinate('y')).toBeGreaterThan(2.9);
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-zone',
    'ГАЛЕРЕЯ',
  );
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: -785 })),
  );
  await page.screenshot({
    path: test.info().outputPath('sandgate-gallery.png'),
  });
  await page.keyboard.press('Escape');
  await page.locator('#mode-select').selectOption('training');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'switchyard',
  );
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});

test('crosses the covered market through its staggered stalls', async ({
  page,
}) => {
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await walkTo(page, 'x', -18.7);
  await walkTo(page, 'z', 0.7);
  await page.screenshot({
    path: test.info().outputPath('sandgate-market.png'),
  });
  await walkTo(page, 'x', -20.5);
  await walkTo(page, 'z', -15);
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-crouched',
    'false',
  );
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
});
test('shows small enemy markers in defense and clears them when changing mode', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('#mode-select').selectOption('waves');
  await page.locator('#bot-difficulty').selectOption('easy');
  await page.locator('#play').click();
  await expect(page.locator('#wave-hud')).toHaveAttribute(
    'data-status',
    'fighting',
  );
  await expect
    .poll(
      async () =>
        Number(
          await page
            .locator('#scene canvas')
            .getAttribute('data-enemy-markers'),
        ),
      { timeout: 15000, intervals: [50] },
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: test.info().outputPath('sandgate-enemies.png'),
  });
  await page.keyboard.press('Escape');
  await page.locator('#mode-select').selectOption('parkour');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-enemy-markers',
    '0',
  );
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
