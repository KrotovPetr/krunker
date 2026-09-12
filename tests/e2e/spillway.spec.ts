import { expect, test } from '@playwright/test';

test('Spillway is selectable and rendered by the live game client', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByLabel('Твой ник').fill('Drainwalker');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();

  await page.locator('#map-select').selectOption('spillway');
  await expect(page.locator('#map-name')).toHaveText('SPILLWAY');
  await expect(page.locator('#map-description')).toContainText('коллектор');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'spillway',
  );

  await page.screenshot({ path: test.info().outputPath('spillway-menu.png') });
  await page.locator('#graphics-quality').selectOption('medium');
  await page.locator('#map-preview').click();
  await expect(page.locator('#app')).toHaveClass(/map-preview/);
  await expect(page.locator('#map-select')).toBeHidden();
  await page.screenshot({
    path: test.info().outputPath('spillway-overview.png'),
  });
  await page.locator('#close-map-preview').click();
  await page.locator('#graphics-quality').selectOption('low');
  await page.locator('#map-preview').click();
  await page.screenshot({ path: test.info().outputPath('spillway-low.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#map-select')).toBeVisible();
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
