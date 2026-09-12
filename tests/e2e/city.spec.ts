import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page, browserName }) => {
  test.skip(
    browserName === 'chromium',
    'Gameplay needs working headless pointer lock.',
  );
  await page.goto('/');
  await page.locator('#nickname').fill('Architect');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#map-select').selectOption('bastion');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'bastion',
  );
});
test('rebuilt Bastion has an open street below the gallery and safe map changes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const quality of ['medium', 'low']) {
    await page.locator('#graphics-quality').selectOption(quality);
    await page.locator('#map-preview').click();
    await page.screenshot({
      path: test.info().outputPath('bastion-' + quality + '.png'),
    });
    await page.keyboard.press('Escape');
  }
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await page.screenshot({ path: test.info().outputPath('bastion-street.png') });
  await page.keyboard.down('w');
  await expect
    .poll(
      async () =>
        Number(await page.locator('#movement-hud').getAttribute('data-z')),
      { timeout: 10000 },
    )
    .toBeLessThan(-9);
  await page.keyboard.up('w');
  expect(
    Number(await page.locator('#movement-hud').getAttribute('data-y')),
  ).toBeLessThan(0.4);
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-map',
    'bastion',
  );
  await page.keyboard.press('m');
  await expect(page.locator('#minimap')).toBeHidden();
  await page.keyboard.press('m');
  await page.keyboard.press('Escape');
  await page.locator('#mode-select').selectOption('parkour');
  await expect(page.locator('#map-select')).toHaveValue('switchyard');
  await expect(page.locator('#map-select')).toBeDisabled();
  await page.locator('#start-challenge').click();
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-map',
    'switchyard',
  );
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
test('depot stairs reach the upper terrace', async ({ page }) => {
  const coordinate = async (axis: string) =>
    Number(await page.locator('#movement-hud').getAttribute('data-' + axis));
  const stop = async (key: string) => {
    await page.keyboard.up(key);
    await expect
      .poll(async () => Number(await page.locator('#speed').textContent()))
      .toBeLessThan(0.1);
  };
  await page.locator('#play').click();
  await page.keyboard.down('w');
  await expect
    .poll(() => coordinate('z'), { intervals: [40] })
    .toBeLessThan(17);
  await stop('w');
  await page.keyboard.down('Shift');
  await page.keyboard.down('a');
  await expect
    .poll(() => coordinate('x'), { intervals: [40] })
    .toBeLessThan(-6.7);
  await stop('a');
  await page.keyboard.up('Shift');
  await page.keyboard.down('w');
  await expect
    .poll(() => coordinate('y'), { timeout: 10000 })
    .toBeGreaterThan(3.9);
  await stop('w');
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-level',
    '1',
  );
  await page.screenshot({
    path: test.info().outputPath('bastion-terrace.png'),
  });
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
});
test('the depot is a standing-height shortcut from market to north square', async ({
  page,
}) => {
  const coordinate = async (axis: string) =>
    Number(await page.locator('#movement-hud').getAttribute('data-' + axis));
  const stop = async (key: string) => {
    await page.keyboard.up(key);
    await expect
      .poll(async () => Number(await page.locator('#speed').textContent()))
      .toBeLessThan(0.1);
  };
  await page.locator('#play').click();
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await expect
    .poll(() => coordinate('z'), { intervals: [40] })
    .toBeLessThan(19.5);
  await stop('w');
  await page.keyboard.down('a');
  await expect
    .poll(() => coordinate('x'), { intervals: [40], timeout: 12000 })
    .toBeLessThan(-18.7);
  await stop('a');
  await page.keyboard.up('Shift');
  await page.keyboard.down('w');
  await expect
    .poll(() => coordinate('z'), { intervals: [40], timeout: 10000 })
    .toBeLessThan(-3);
  await stop('w');
  await page.screenshot({
    path: test.info().outputPath('bastion-depot-interior.png'),
  });
  await page.keyboard.down('w');
  await expect
    .poll(() => coordinate('z'), { intervals: [40], timeout: 10000 })
    .toBeLessThan(-16);
  await stop('w');
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
});
