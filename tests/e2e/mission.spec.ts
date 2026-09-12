import { expect, test } from '@playwright/test';

test('launches Last Run, shares the mission with a friend, validates interaction distance and clears the HUD', async ({
  page,
  browser,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Gameplay needs working headless pointer lock.',
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#mission-play')).toBeEnabled();
  await page.screenshot({
    path: test.info().outputPath('mission-entry.png'),
    fullPage: true,
  });
  await page.locator('#mission-play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#mission-hud')).toHaveAttribute(
    'data-stage',
    'dispatch',
  );
  await expect(page.locator('#mission-title')).toContainText(
    'Голос со станции',
  );
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'bastion',
  );
  await page.keyboard.down('f');
  await page.waitForTimeout(700);
  await page.keyboard.up('f');
  await expect(page.locator('#mission-hud')).toHaveAttribute(
    'data-progress',
    '0',
  );
  await page.keyboard.press('t');
  await expect(page.locator('#squad-command-hud')).toHaveAttribute(
    'data-order',
    'attack',
  );
  await page.screenshot({ path: test.info().outputPath('mission-start.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#map-select')).toBeDisabled();
  const invite = await page.locator('#invite').inputValue();
  const context = await browser.newContext();
  try {
    const friend = await context.newPage();
    await friend.goto(invite);
    await friend.locator('#nickname').fill('Friend');
    await friend.locator('#join').click();
    await expect(friend.locator('#mode-select')).toHaveValue('mission');
    await friend.locator('#play').click();
    await expect(friend.locator('#mission-hud')).toHaveAttribute(
      'data-stage',
      'dispatch',
    );
    await expect(friend.locator('#mission-radio-text')).toContainText('Штаб');
    await friend.keyboard.press('Escape');
    await page.locator('#mode-select').selectOption('control');
    await expect(friend.locator('#mission-hud')).toBeHidden();
    await expect(friend.locator('#mission-radio')).toBeHidden();
    await expect(friend.locator('#scene canvas')).toHaveAttribute(
      'data-mission',
      'off',
    );
  } finally {
    await context.close();
  }
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
