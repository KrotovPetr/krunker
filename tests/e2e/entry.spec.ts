import { expect, test } from '@playwright/test';

test('landing separates quick start, custom rooms, map preview and controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#coop-play')).toBeEnabled();
  await expect(page.locator('#coop-play')).toContainText('2 союзных бота');
  await expect(page.locator('.roster')).toBeHidden();
  await expect(page.locator('#session')).toBeHidden();
  await expect(page.locator('.stage-note')).toBeHidden();
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'spillway',
  );
  const nickname = await page.locator('#nickname').boundingBox();
  const start = await page.locator('#coop-play').boundingBox();
  expect(nickname!.y).toBeLessThan(start!.y);
  await page.screenshot({
    path: test.info().outputPath('start-desktop.png'),
    fullPage: true,
  });
  await page.locator('#landing-preview').click();
  await expect(page.locator('#join-form')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#landing-preview')).toBeFocused();
  await page.locator('.controls-guide summary').click();
  await expect(page.locator('.controls-quick-reference')).toBeVisible();
  await page.locator('.controls-guide summary').click();
  // Creating a custom room also works without inventing a nickname first.
  await page.locator('#join').click();
  await expect(page.locator('#session')).toBeVisible();
  await expect(page.locator('#players')).toContainText('Игрок');
  await expect(page.locator('.landing-map')).toBeHidden();
  await page.locator('#leave').click();
  await expect(page.locator('#join-form')).toBeVisible();
  await expect(page.locator('.landing-map')).toBeVisible();
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'spillway',
  );
  expect(errors).toEqual([]);
});

test('narrow landing has no horizontal overflow and keeps every entry route', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#coop-play')).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page.locator('#join')).toBeVisible();
  await page.locator('#friend-entry summary').click();
  await page.locator('#friend-link').fill('https://example.com/no-invitation');
  await page.locator('#join-friend').click();
  await expect(page.locator('#friend-link')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.locator('#friend-error')).toContainText('код комнаты');
  await expect(page.locator('#join-form')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.locator('#friend-entry summary').click();
  await page.screenshot({
    path: test.info().outputPath('start-narrow.png'),
    fullPage: true,
  });
});

test('pasted invitations join the existing room; direct invitations have one entry action', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.locator('#nickname').fill('Host');
  await page.locator('#join').click();
  await expect(page.locator('#session')).toBeVisible();
  await page.locator('#map-select').selectOption('sandgate');
  const invite = await page.locator('#invite').inputValue();
  const context = await browser.newContext();
  try {
    const friend = await context.newPage();
    await friend.goto(invite);
    await expect(friend.locator('#invitation-notice')).toBeVisible();
    await expect(friend.locator('#coop-play')).toBeHidden();
    await expect(friend.locator('#quick-play')).toBeHidden();
    await expect(friend.locator('#join')).toHaveText('Войти в комнату');
    await friend.screenshot({
      path: test.info().outputPath('start-invited.png'),
      fullPage: true,
    });
    await friend.goto('/');
    await friend.locator('#nickname').fill('Friend');
    await friend.locator('#friend-entry summary').click();
    await friend.locator('#friend-link').fill(invite);
    await friend.locator('#friend-link').press('Enter');
    await expect(friend.locator('#session')).toBeVisible();
    await expect(friend.locator('#map-select')).toHaveValue('sandgate');
    await expect(page.locator('#player-count')).toHaveText('2 / 8');
    await friend.locator('#leave').click();
    await expect(friend.locator('#coop-play')).toBeVisible();
    await expect(friend.locator('#invitation-notice')).toBeHidden();
  } finally {
    await context.close();
  }
  await page.locator('#leave').click();
});
