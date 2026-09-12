import { expect, test } from '@playwright/test';

test('grenades replicate to a squadmate, spend inventory once and reset on map change', async ({
  page,
  browser,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Gameplay needs working headless pointer lock.',
  );
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#nickname').fill('Grenadier');
  await page.locator('#coop-play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#invite')).toHaveValue(/\?room=.+/);
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'spillway',
  );
  const invite = await page.locator('#invite').inputValue();
  const context = await browser.newContext();
  const friend = await context.newPage();
  friend.on('pageerror', (e) => errors.push(e.message));
  try {
    await friend.goto(invite);
    await friend.locator('#nickname').fill('Squadmate');
    await friend.locator('#join').click();
    await expect(friend.locator('#mode-select')).toHaveValue('waves');
    await expect(friend.locator('#mode-select')).toBeDisabled();
    await expect(friend.locator('#scene canvas')).toHaveAttribute(
      'data-map',
      'spillway',
    );
    await expect
      .poll(() => page.locator('#players .dot').count())
      .toBeGreaterThanOrEqual(4);
    const colors = await page
      .locator('#players .dot')
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).style.backgroundColor),
      );
    expect(new Set(colors).size).toBe(colors.length);
    await friend.locator('#play').click();
    await expect(friend.locator('#app')).toHaveClass(/playing/);
    await page.locator('#play').click();
    await expect(page.locator('#wave-hud')).toHaveAttribute(
      'data-status',
      'fighting',
      { timeout: 20000 },
    );
    await expect(page.locator('#grenade-hud')).toHaveAttribute(
      'data-count',
      '1',
    );
    await expect(page.locator('#health-kit-hud')).toContainText('35 HP');
    await page.keyboard.press('b');
    await expect(page.locator('#grenade-hud')).toHaveAttribute(
      'data-count',
      '0',
    );
    await expect(page.locator('#scene canvas')).toHaveAttribute(
      'data-grenades',
      '1',
    );
    await expect(friend.locator('#scene canvas')).toHaveAttribute(
      'data-grenades',
      '1',
    );
    await expect(friend.locator('#grenade-hud')).toHaveAttribute(
      'data-count',
      '1',
    );
    await page.keyboard.press('b');
    await expect(page.locator('#scene canvas')).toHaveAttribute(
      'data-grenades',
      '0',
      { timeout: 4000 },
    );
    await expect(page.locator('#grenade-hud')).toHaveAttribute(
      'data-count',
      '0',
    );
    await page.screenshot({
      path: test.info().outputPath('grenadier-in-game.png'),
    });
    await page.keyboard.press('Escape');
    await page.locator('#map-select').selectOption('bastion');
    await expect(page.locator('#grenade-hud')).toHaveAttribute(
      'data-count',
      '1',
    );
    await expect(friend.locator('#scene canvas')).toHaveAttribute(
      'data-map',
      'bastion',
    );
    await expect(friend.locator('#scene canvas')).toHaveAttribute(
      'data-grenades',
      '0',
    );
  } finally {
    await context.close();
  }
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
