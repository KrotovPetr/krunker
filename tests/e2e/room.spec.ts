import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test('two browser contexts share a room and observe departure', async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const errors: string[] = [];
  for (const page of [first, second])
    page.on('pageerror', (error) => errors.push(error.message));
  try {
    await first.goto('/');
    await first.getByLabel('Твой ник').fill('Alice');
    await first.getByRole('button', { name: 'Создать комнату' }).click();
    await expect(first.locator('#status')).toHaveText('В комнате');
    await expect(first.locator('#player-count')).toHaveText('1 / 8');
    const invite = await first.getByLabel('Ссылка для друзей').inputValue();
    await second.goto(invite);
    await second.getByLabel('Твой ник').fill('Bob');
    await second.getByRole('button', { name: 'Войти в комнату' }).click();
    for (const page of [first, second]) {
      await expect(page.locator('#player-count')).toHaveText('2 / 8');
      await expect(page.locator('#players')).toContainText('Alice');
      await expect(page.locator('#players')).toContainText('Bob');
      await expect(page.locator('#scene canvas')).toBeVisible();
      await expect(page.locator('#scene canvas')).toHaveAttribute(
        'data-player-count',
        '2',
      );
    }
    await first.screenshot({ path: test.info().outputPath('room.png') });
    await second.getByRole('button', { name: 'Выйти из комнаты' }).click();
    await expect(first.locator('#player-count')).toHaveText('1 / 8');
    await expect(second.locator('#status')).toHaveText('Не подключён');
    await first.getByRole('button', { name: 'Выйти из комнаты' }).click();
    await expect(first.locator('#status')).toHaveText('Не подключён');
    expect(errors).toEqual([]);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('first-person controls move, jump, crouch and stop when the menu opens', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in Chromium headless shell is deferred by request.',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const coordinate = async (name: string) =>
    Number(await page.locator('#movement-hud').getAttribute(`data-${name}`));
  await page.goto('/');
  await page.getByLabel('Твой ник').fill('Walker');
  await page.getByRole('button', { name: 'Создать комнату' }).click();
  const play = page.getByRole('button', { name: 'Выйти на арену' });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-grounded',
    'true',
  );
  const startY = await coordinate('y');
  await page.keyboard.press('Space');
  await expect.poll(() => coordinate('y')).toBeGreaterThan(startY + 0.2);
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-grounded',
    'true',
  );
  await page.keyboard.down('Shift');
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-crouched',
    'true',
  );
  await page.keyboard.up('Shift');
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-crouched',
    'false',
  );
  // Every spawn has an open route toward the map's X center. Forward may face cover.
  const startX = await coordinate('x');
  const moveKey = startX < 0 ? 'd' : 'a';
  await page.keyboard.down(moveKey);
  await expect
    .poll(async () => Math.abs((await coordinate('x')) - startX))
    .toBeGreaterThan(1);
  await expect
    .poll(async () => Number(await page.locator('#speed').textContent()))
    .toBeGreaterThan(7);
  await page.keyboard.down('Shift');
  await expect(page.locator('#movement-hud')).toHaveAttribute(
    'data-sliding',
    'true',
  );
  await page.screenshot({ path: test.info().outputPath('first-person.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).not.toHaveClass(/playing/);
  await page.keyboard.up(moveKey);
  await page.keyboard.up('Shift');
  await expect
    .poll(async () => Number(await page.locator('#speed').textContent()))
    .toBeLessThan(0.1);
  // Resume must require a new click and must not restore held keys.
  await play.click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#speed')).toHaveText('0.0');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('mouse sensitivity persists across reload', async ({ page }) => {
  async function join(page: Page) {
    await page.getByLabel('Твой ник').fill('Settings');
    await page.locator('#join').click();
    await expect(page.locator('#session')).toBeVisible();
  }
  await page.goto('/');
  await join(page);
  await page.getByLabel('Чувствительность мыши').fill('3.4');
  await expect(page.locator('#sensitivity-value')).toHaveText('3.4');
  await page.getByRole('button', { name: 'Выйти из комнаты' }).click();
  await expect(page.locator('#join-form')).toBeVisible();
  await page.reload();
  await join(page);
  await expect(page.getByLabel('Чувствительность мыши')).toHaveValue('3.4');
});

test('a missing room shows an error and allows retry', async ({ page }) => {
  await page.goto('/?room=missing-room');
  await page.getByLabel('Твой ник').fill('Alice');
  const join = page.getByRole('button', { name: 'Войти в комнату' });
  await join.click();
  await expect(page.locator('#message')).toContainText('Комната недоступна');
  await expect(join).toBeEnabled();
});
