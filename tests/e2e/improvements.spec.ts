import { expect, test } from '@playwright/test';

test('graphics profiles apply to WebGL and persist', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem('browser-fps-graphics-quality', 'low'),
  );
  await page.reload();
  const canvas = page.locator('#scene canvas');
  const quality = page.locator('#graphics-quality');
  await expect(quality).toHaveValue('low');
  await expect(canvas).toHaveAttribute('data-graphics-quality', 'low');
  await expect(canvas).toHaveAttribute('data-shadows', 'false');
  await expect(canvas).toHaveAttribute('data-map-details', 'reduced');
  expect(
    await canvas.evaluate(
      (element) =>
        (element as HTMLCanvasElement).width /
        element.getBoundingClientRect().width,
    ),
  ).toBeCloseTo(0.75, 1);

  await page.locator('#nickname').fill('Graphics');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await quality.selectOption('medium');
  await expect(canvas).toHaveAttribute('data-shadows', 'true');
  await expect(canvas).toHaveAttribute('data-map-details', 'full');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('browser-fps-graphics-quality'),
    ),
  ).toBe('medium');
  await page.reload();
  await expect(quality).toHaveValue('medium');
  await expect(canvas).toHaveAttribute('data-graphics-quality', 'medium');
});

test('quick entry starts defense; optional allies and compact ammo HUD survive the network round trip', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in headless shell remains deferred.',
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#quick-play')).toBeEnabled();
  await page.locator('#quick-play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#wave-hud')).toHaveAttribute(
    'data-status',
    /preparing|fighting/,
  );
  await expect(page.locator('#ammo-reserve')).toHaveText('ЗАПАС 90');
  await expect(page.locator('.controls-hint')).toBeHidden();
  await expect(page.locator('.movement-readout')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('#map-select').selectOption('bastion');
  await page.locator('#ally-count').selectOption('2');
  await page.locator('#play').click();
  await expect(page.locator('#players')).toContainText('Союзник · Рук');
  await expect(page.locator('#players')).toContainText('Союзник · Искра');
  await expect(page.locator('#wave-hud')).toHaveAttribute('data-enemies', '2');
  await expect(page.locator('#wave-team')).toContainText('Защитники 3/3');
  await page.screenshot({
    path: test.info().outputPath('compact-defense.png'),
  });
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});

test('unchanged network snapshots preserve roster and score rows, while class changes update scores', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#nickname').fill('Stable UI');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#score-rows tr')).toHaveCount(1);
  const tick = await page.locator('#movement-hud').getAttribute('data-tick');
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#players li')!.dataset.identity =
      'keep';
    document.querySelector<HTMLElement>('#score-rows tr')!.dataset.identity =
      'keep';
  });
  await expect
    .poll(async () =>
      Number(await page.locator('#movement-hud').getAttribute('data-tick')),
    )
    .toBeGreaterThan(Number(tick) + 12);
  await expect(page.locator('#players li')).toHaveAttribute(
    'data-identity',
    'keep',
  );
  await expect(page.locator('#score-rows tr')).toHaveAttribute(
    'data-identity',
    'keep',
  );
  await page.locator('#weapon-select').selectOption('sniper');
  await expect(page.locator('#score-rows')).toContainText('Снайперка');
  await expect(page.locator('#players li')).toHaveAttribute(
    'data-identity',
    'keep',
  );
  await page.locator('#leave').click();
});
