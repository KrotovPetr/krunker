import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, browserName }) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in Chromium headless shell remains deferred.',
  );
  await page.goto('/');
  await page.getByLabel('Твой ник').fill('Architect');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#map-select').selectOption('bastion');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'bastion',
  );
});

test('Bastion has a traversable civic hall, a live minimap and safe map changes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.screenshot({ path: test.info().outputPath('city-menu.png') });
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-map',
    'bastion',
  );
  await page.screenshot({ path: test.info().outputPath('city-street.png') });
  await page.keyboard.down('w');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-z')),
      { intervals: [40] },
    )
    .toBeLessThan(3);
  await page.keyboard.up('w');
  await expect
    .poll(async () =>
      Number(await page.locator('#minimap-canvas').getAttribute('data-z')),
    )
    .toBeLessThan(3);
  await page.screenshot({ path: test.info().outputPath('city-atrium.png') });
  await page.keyboard.press('m');
  await expect(page.locator('#minimap')).toBeHidden();
  await page.keyboard.press('m');
  await expect(page.locator('#minimap')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#mode-select').selectOption('parkour');
  await expect(page.locator('#map-select')).toHaveValue('switchyard');
  await expect(page.locator('#map-select')).toBeDisabled();
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'switchyard',
  );
  await page.locator('#start-challenge').click();
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-map',
    'switchyard',
  );
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});

test('external stairs lead to the roof and minimap displays the upper level', async ({
  page,
}) => {
  await page.locator('#play').click();
  await page.keyboard.down('w');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-z')),
      { intervals: [40] },
    )
    .toBeLessThan(11);
  await page.keyboard.up('w');
  await page.keyboard.down('d');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-x')),
      { intervals: [40] },
    )
    .toBeGreaterThan(10.9);
  await page.keyboard.up('d');
  await page.keyboard.down('w');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-y')),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(4.7);
  await page.keyboard.up('w');
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-level',
    '1',
  );
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementX: -785, movementY: 90 }),
    ),
  );
  await page.screenshot({ path: test.info().outputPath('city-roof.png') });
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
});
