import { expect, test } from '@playwright/test';

test('solo warmup supports grenades, mines and a knife that stays equipped', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Gameplay needs working headless pointer lock.',
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#nickname').fill('Equipment');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#map-select').selectOption('switchyard');
  await page.locator('#weapon-select').selectOption('sapper');
  await expect(page.locator('#class-name')).toHaveText('Инженер');
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-grounded',
    'true',
  );
  await page.keyboard.press('b');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-grenades',
    '1',
  );
  await expect(page.locator('#grenade-hud')).toHaveAttribute('data-count', '0');
  await page.keyboard.press('g');
  await expect(page.locator('#mine-hud')).toHaveAttribute('data-count', '1');
  await page.keyboard.press('g');
  await expect(page.locator('#supply-notice')).toContainText('ещё не готова');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-grenades',
    '0',
    { timeout: 4000 },
  );
  await expect(page.locator('#grenade-hud')).toHaveAttribute('data-count', '1');
  // Aim at the mine placed 0.85 m ahead, then verify the server removes it.
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent('mousemove', { movementY: 540 })),
  );
  await page.waitForTimeout(250);
  await page.screenshot({
    path: test.info().outputPath('visible-engineer-mine.png'),
  });
  await page.mouse.click(640, 360);
  await expect(page.locator('#mine-hud')).toHaveAttribute('data-count', '0');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-mines',
    '0',
  );
  await expect(page.locator('#ammo')).toHaveText('23 / 24');
  const ammo = await page.locator('#ammo').innerText();
  await page.keyboard.press('v');
  await expect(page.locator('#weapon-name')).toHaveText('Нож');
  await expect(page.locator('#weapon-name')).toHaveAttribute(
    'data-slot',
    'knife',
  );
  await expect(page.locator('#ammo')).toHaveText('ЛКМ · УДАР');
  await page.waitForTimeout(350);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(650);
  await expect(page.locator('#weapon-name')).toHaveText('Нож');
  await page.screenshot({
    path: test.info().outputPath('knife-held-after-stab.png'),
  });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(650);
  await expect(page.locator('#weapon-name')).toHaveText('Нож');
  await page.keyboard.press('r');
  await expect(page.locator('#ammo')).toHaveText('ЛКМ · УДАР');
  await page.keyboard.press('1');
  await expect(page.locator('#ammo')).toHaveText(ammo);
  await page.keyboard.press('3');
  await expect(page.locator('#weapon-name')).toHaveText('Нож');
  await page.keyboard.press('2');
  await expect(page.locator('#weapon-name')).toHaveAttribute(
    'data-slot',
    'secondary',
  );
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
