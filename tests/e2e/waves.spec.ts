import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, browserName }) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in Chromium headless shell remains deferred.',
  );
  await page.goto('/');
  await page.getByLabel('Твой ник').fill('Defender');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
});

test('wave defense waits for a player, launches a finite attack and can retry after defeat', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('#mode-select').selectOption('waves');
  await page.locator('#bot-difficulty').selectOption('hard');
  await expect(page.locator('#players li')).toHaveCount(1);
  await page.locator('#weapon-select').selectOption('smg');
  await page.locator('#play').click();
  await expect(page.locator('#wave-hud')).toHaveAttribute(
    'data-status',
    'preparing',
  );
  await expect(page.locator('#protection')).toContainText('ЩИТ');
  await expect(page.locator('#weapon-name')).toHaveText('ПП «Вектор»');
  await expect(page.locator('#ammo')).toHaveText('32 / 32');
  await expect(page.locator('#wave-hud')).toHaveAttribute(
    'data-status',
    'fighting',
  );
  await expect(page.locator('#players li')).toHaveCount(3);
  await expect(page.locator('#wave-hud')).toHaveAttribute('data-enemies', '2');
  await expect(page.locator('.combat-readout')).toBeVisible();
  await expect(page.locator('.movement-readout')).toBeHidden();
  await expect(page.locator('#ammo-reserve')).toHaveText('ЗАПАС 96');
  await page.screenshot({ path: test.info().outputPath('wave-start.png') });
  await page.mouse.down();
  await expect
    .poll(async () =>
      Number((await page.locator('#ammo').textContent())?.split(' / ')[0]),
    )
    .toBeLessThan(30);
  await page.mouse.up();
  await page.keyboard.press('r');
  await expect(page.locator('#ammo')).toContainText('Перезарядка');
  await expect(page.locator('#ammo')).toHaveText('32 / 32');
  await page.screenshot({ path: test.info().outputPath('wave-defense.png') });
  await expect(page.locator('#wave-hud')).toHaveAttribute(
    'data-status',
    'defeat',
    { timeout: 60_000 },
  );
  await expect(page.locator('#health')).toHaveAttribute('data-value', '0');
  await expect(page.locator('#score-title')).toContainText('Оборона закончена');
  await page.keyboard.press('Escape');
  await expect(page.locator('#scoreboard')).toBeHidden();
  await page.locator('#weapon-select').selectOption('revolver');
  await expect(page.locator('#health')).toHaveAttribute('data-value', '0');
  await page.locator('#play').click();
  await page.keyboard.press('r');
  await expect(page.locator('#wave-hud')).toHaveAttribute(
    'data-status',
    'preparing',
  );
  await expect(page.locator('#health')).toHaveAttribute('data-value', '100');
  await expect(page.locator('#weapon-name')).toHaveText('Револьвер');
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});

test('revolver fires once per click, reloads six rounds and preserves its magazine on slot change', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('#map-select').selectOption('bastion');
  await page.locator('#weapon-select').selectOption('revolver');
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#ready')).toBeDisabled();
  await expect(page.locator('#ammo')).toHaveText('6 / 6');
  await page.mouse.down();
  await expect(page.locator('#ammo')).toHaveText('5 / 6');
  // Holding the trigger past its cooldown must not fire a second round.
  await page.waitForTimeout(650);
  await expect(page.locator('#ammo')).toHaveText('5 / 6');
  await page.mouse.up();
  await page.keyboard.press('2');
  await expect(page.locator('#ammo')).toHaveText('12 / 12');
  await page.keyboard.press('1');
  await expect(page.locator('#ammo')).toHaveText('5 / 6');
  await page.keyboard.press('q');
  await expect(page.locator('#movement-hud')).toHaveAttribute('data-aim', '1');
  await page.mouse.click(600, 350);
  await expect(page.locator('#ammo')).toHaveText('4 / 6');
  await page.screenshot({ path: test.info().outputPath('revolver-city.png') });
  await page.keyboard.press('r');
  await expect(page.locator('#ammo')).toContainText('Перезарядка');
  await expect(page.locator('#ammo')).toHaveText('6 / 6');
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
