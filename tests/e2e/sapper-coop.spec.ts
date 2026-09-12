import { expect, test } from '@playwright/test';

test('quick squad starts Spillway with two allies and preserves the room for an invited friend', async ({
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
  await page.locator('#nickname').fill('Sapper host');
  await page.locator('#coop-play').click();
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'spillway',
  );
  await expect(page.locator('#wave-hud')).toHaveAttribute(
    'data-status',
    'preparing',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('#ally-count')).toHaveValue('2');
  await expect(page.locator('#squad-summary')).toContainText('2 союзных ботов');
  await page.locator('#weapon-select').selectOption('sapper');
  await expect(page.locator('#class-name')).toHaveText('Инженер');
  // Restart the preparation timer through the existing host settings.
  await page.locator('#bot-difficulty').selectOption('easy');
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#wave-hud')).toHaveAttribute(
    'data-status',
    'preparing',
  );
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-grounded',
    'true',
  );
  await expect(page.locator('#weapon-name')).toHaveText('Карабин «Заслон»');
  await expect(page.locator('#mine-hud')).toHaveAttribute('data-count', '0');
  await page.keyboard.press('g');
  await expect(page.locator('#mine-hud')).toHaveAttribute('data-count', '1');
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-mines',
    '1',
  );
  await page.keyboard.press('g');
  await expect(page.locator('#mine-hud')).toHaveAttribute('data-count', '1');
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent('mousemove', { movementY: 490 })),
  );
  await page.screenshot({
    path: test.info().outputPath('bastion-sapper-mine.png'),
  });
  await page.keyboard.press('Escape');
  const invite = await page.locator('#invite').inputValue();
  const context = await browser.newContext();
  const friend = await context.newPage();
  friend.on('pageerror', (e) => errors.push(e.message));
  try {
    await friend.goto(invite);
    await friend.locator('#nickname').fill('Squad friend');
    await friend.locator('#join').click();
    await expect(friend.locator('#mode-select')).toHaveValue('waves');
    await expect(friend.locator('#mode-select')).toBeDisabled();
    await expect(friend.locator('#squad-summary')).toContainText('2/4 друзей');
    await expect(page.locator('#squad-summary')).toContainText('2/4 друзей');
    await expect(friend.locator('#scene canvas')).toHaveAttribute(
      'data-map',
      'spillway',
    );
    await friend.locator('#play').click();
    await expect(friend.locator('#app')).toHaveClass(/playing/);
    await friend.keyboard.press('Escape');
    await page.locator('#map-select').selectOption('sandgate');
    await expect(page.locator('#mine-hud')).toHaveAttribute('data-count', '0');
    await expect(friend.locator('#scene canvas')).toHaveAttribute(
      'data-map',
      'sandgate',
    );
  } finally {
    await context.close();
  }
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
