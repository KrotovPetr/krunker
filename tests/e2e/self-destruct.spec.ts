import { expect, test } from '@playwright/test';

test('holds K to self-destruct once, cancels a short press and respawns without a frag', async ({
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
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#mode-select').selectOption('training');
  await expect(page.locator('#challenge-actions')).toBeVisible();
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#health')).toHaveAttribute('data-value', '100');
  const life = await page.locator('#health').getAttribute('data-life');
  await page.keyboard.down('k');
  await expect(page.locator('#self-destruct-hint')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('hold-k.png') });
  await page.keyboard.up('k');
  await expect(page.locator('#self-destruct-hint')).toBeHidden();
  await page.waitForTimeout(1700);
  await expect(page.locator('#health')).toHaveAttribute('data-life', life!);
  await expect(page.locator('#health')).toHaveAttribute('data-value', '100');
  await page.keyboard.down('k');
  await expect(page.locator('#health')).toHaveAttribute('data-value', '0', {
    timeout: 3000,
  });
  await expect(page.locator('#death-message')).toBeVisible();
  await expect(page.locator('#kill-confirm')).not.toContainText(
    'ЦЕЛЬ УСТРАНЕНА',
  );
  await expect(page.locator('#health')).not.toHaveAttribute(
    'data-life',
    life!,
    { timeout: 5000 },
  );
  await expect(page.locator('#health')).toHaveAttribute('data-value', '100');
  // Keep holding across respawn: a fresh key press is required for another death.
  await expect(page.locator('#self-destruct-hint')).toBeHidden();
  await page.waitForTimeout(1700);
  await expect(page.locator('#health')).toHaveAttribute('data-value', '100');
  await expect(page.locator('#health')).toHaveAttribute(
    'data-life',
    String(Number(life) + 1),
  );
  await page.keyboard.up('k');
  await page.keyboard.down('k');
  await expect(page.locator('#self-destruct-hint')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.up('k');
  await page.waitForTimeout(1600);
  await page.locator('#play').click();
  await expect(page.locator('#health')).toHaveAttribute('data-value', '100');
  expect(errors).toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
});
