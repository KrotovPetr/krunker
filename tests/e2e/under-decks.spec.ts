import { expect, test } from '@playwright/test';

test('Switchyard lower route crosses the cooling platform without crouching', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Gameplay needs working headless pointer lock.',
  );
  await page.goto('/');
  await page.locator('#nickname').fill('Underwalker');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#map-select').selectOption('switchyard');
  await page.locator('#map-preview').click();
  await page.screenshot({
    path: test.info().outputPath('switchyard-overview.png'),
  });
  await page.keyboard.press('Escape');
  await page.locator('#play').click();
  const coordinate = async (axis: string) =>
    Number(await page.locator('#movement-hud').getAttribute('data-' + axis));
  const stop = async (key: string) => {
    await page.keyboard.up(key);
    await expect
      .poll(async () => Number(await page.locator('#speed').textContent()))
      .toBeLessThan(0.1);
  };
  await page.keyboard.down('s');
  await expect
    .poll(() => coordinate('z'), { intervals: [40] })
    .toBeGreaterThan(10.5);
  await stop('s');
  await page.keyboard.down('d');
  await expect
    .poll(() => coordinate('x'), { intervals: [40] })
    .toBeGreaterThan(-5.2);
  await stop('d');
  await page.keyboard.down('s');
  await expect
    .poll(() => coordinate('z'), { intervals: [40] })
    .toBeGreaterThan(17);
  await stop('s');
  await page.screenshot({
    path: test.info().outputPath('switchyard-under-platform.png'),
  });
  await page.keyboard.down('s');
  await expect
    .poll(() => coordinate('z'), { intervals: [40] })
    .toBeGreaterThan(22);
  await stop('s');
  expect(await coordinate('y')).toBeLessThan(0.3);
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-crouched',
    'false',
  );
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
});
