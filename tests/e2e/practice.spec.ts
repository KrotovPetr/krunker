import { expect, test } from '@playwright/test';

test('solo practice supports sniper shots and a toggleable optical sight', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in Chromium headless shell is deferred by request.',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Твой ник').fill('Practice');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#weapon-select').selectOption('sniper');
  await expect(page.locator('#weapon-name')).toHaveText('Снайперка');
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#match-time')).toContainText(
    'Пристрелочный полигон',
  );
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-grounded',
    'true',
  );
  await page.keyboard.press('q');
  await expect(page.locator('#scope')).toBeVisible();
  await expect(page.locator('#movement-hud')).toHaveAttribute('data-aim', '1');
  await expect(page.locator('#crosshair')).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('sniper-scope.png') });
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#ammo')).toHaveText('4 / 5');
  await expect(page.locator('#practice-hit')).toContainText(
    'Голова · 200 урона',
  );
  await expect(page.locator('#personal-score')).toHaveText(
    '0 убийств · 0 смертей',
  );
  await expect(page.locator('#match-time')).toHaveAttribute(
    'data-phase',
    'waiting',
  );
  await page.keyboard.press('r');
  await expect(page.locator('#ammo')).toContainText('Перезарядка');
  await expect(page.locator('#ammo')).toHaveText('5 / 5');
  await page.keyboard.press('q');
  await expect(page.locator('#scope')).toBeHidden();
  await expect(page.locator('#crosshair')).toBeVisible();
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('#scope')).toBeVisible();
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('#scope')).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('practice-range.png') });
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
