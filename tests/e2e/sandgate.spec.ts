import { expect, test } from '@playwright/test';
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
test('walks long A and the rear connection to B, with matching minimap and challenge reset', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.screenshot({ path: test.info().outputPath('sandgate-menu.png') });
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#location-name')).toHaveText('ПЛОЩАДЬ');
  await page.screenshot({ path: test.info().outputPath('sandgate-plaza.png') });
  await page.keyboard.down('d');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-x')),
      { intervals: [40] },
    )
    .toBeGreaterThan(19.5);
  await page.keyboard.up('d');
  await expect
    .poll(async () => Number(await page.locator('#speed').textContent()))
    .toBeLessThan(0.1);
  await page.keyboard.down('w');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-z')),
      { timeout: 8000, intervals: [40] },
    )
    .toBeLessThan(-12);
  await page.keyboard.up('w');
  await expect
    .poll(async () => Number(await page.locator('#speed').textContent()))
    .toBeLessThan(0.1);
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-zone',
    'A',
  );
  await page.screenshot({ path: test.info().outputPath('sandgate-a.png') });
  // Pass the crates on their east side before taking the northern connector.
  await page.keyboard.down('d');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-x')),
      { intervals: [40] },
    )
    .toBeGreaterThan(25);
  await page.keyboard.up('d');
  await expect
    .poll(async () => Number(await page.locator('#speed').textContent()))
    .toBeLessThan(0.1);
  // Cross north of the supply crates, south of the rear-street cover.
  // Start crouching from rest to avoid triggering a slide into that cover.
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-z')),
      { intervals: [40] },
    )
    .toBeLessThan(-23.8);
  await page.keyboard.up('w');
  await expect
    .poll(async () => Number(await page.locator('#speed').textContent()))
    .toBeLessThan(0.1);
  await page.keyboard.up('Shift');
  await page.keyboard.down('a');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-x')),
      { timeout: 9000, intervals: [40] },
    )
    .toBeLessThan(-20);
  await page.keyboard.up('a');
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-zone',
    'B',
  );
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementX: 1570, movementY: 0 }),
    ),
  );
  await page.screenshot({ path: test.info().outputPath('sandgate-b.png') });
  await page.keyboard.press('Escape');
  await page.locator('#mode-select').selectOption('training');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'switchyard',
  );
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
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
