import { expect, test } from '@playwright/test';

test('walks into the ground-level objective and earns team control score', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Gameplay needs working headless pointer lock.',
  );
  test.setTimeout(45000);
  await page.goto('/');
  await page.locator('#control-play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await page.keyboard.press('Escape');
  await page.locator('#bot-difficulty').selectOption('easy');
  await page.locator('#bot-count').selectOption('1');
  await page.locator('#ally-count').selectOption('3');
  await page.locator('#play').click();
  const value = async (axis: string) =>
    Number(await page.locator('#movement-hud').getAttribute('data-' + axis));
  // Combat can kill and respawn the walker. Rejoin the route from the actual
  // position instead of holding W into the tram after a respawn.
  let movement: 'a' | 'd' | 'w' | undefined;
  try {
    await expect
      .poll(
        async () => {
          const x = await value('x');
          const z = await value('z');
          const next =
            x < 1.7 ? 'd' : x > 2.7 ? 'a' : z >= -3.5 ? 'w' : undefined;
          if (next !== movement) {
            if (movement) await page.keyboard.up(movement);
            if (next) await page.keyboard.down(next);
            movement = next;
          }
          return z < -3.5 && x >= 1.7 && x <= 2.7;
        },
        { timeout: 25000, intervals: [30] },
      )
      .toBe(true);
  } finally {
    if (movement) await page.keyboard.up(movement);
  }
  await expect(page.locator('#minimap-canvas')).toHaveAttribute(
    'data-zone',
    'ПОД ГАЛЕРЕЕЙ',
  );
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent('mousemove', { movementY: 200 })),
  );
  await page.screenshot({
    path: test.info().outputPath('inside-objective.png'),
  });
  await expect
    .poll(
      async () =>
        Number(await page.locator('#control-hud').getAttribute('data-score')),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
});

test('starts control on Bastion, accepts squad commands and shares them with a friend', async ({
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
  await page.locator('#nickname').fill('Commander');
  await page.locator('#control-play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#scene canvas')).toHaveAttribute(
    'data-map',
    'bastion',
  );
  await expect(page.locator('#control-hud')).toBeVisible();
  await expect(page.locator('#control-score')).toContainText('до 90');
  await page.keyboard.press('z');
  await expect(page.locator('#squad-command-hud')).toHaveAttribute(
    'data-order',
    'follow',
  );
  await expect(page.locator('#squad-order-state')).toContainText('Commander');
  await page.waitForTimeout(1100);
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent('mousemove', { movementY: 600 })),
  );
  await page.waitForTimeout(250);
  await page.keyboard.press('x');
  await expect(page.locator('#squad-command-hud')).toHaveAttribute(
    'data-order',
    'hold',
  );
  await page.screenshot({ path: test.info().outputPath('hold-position.png') });
  await page.waitForTimeout(1100);
  await page.keyboard.press('t');
  await expect(page.locator('#squad-command-hud')).toHaveAttribute(
    'data-order',
    'attack',
  );
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent('mousemove', { movementY: -600 })),
  );
  await page.screenshot({
    path: test.info().outputPath('control-bastion.png'),
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('#map-select')).toBeDisabled();
  await expect(page.locator('#ally-count')).toHaveValue('2');
  const invite = await page.locator('#invite').inputValue();
  const context = await browser.newContext();
  try {
    const friend = await context.newPage();
    friend.on('pageerror', (e) => errors.push(e.message));
    await friend.goto(invite);
    await friend.locator('#nickname').fill('Friend');
    await friend.locator('#join').click();
    await expect(friend.locator('#mode-select')).toHaveValue('control');
    await expect(friend.locator('#mode-select')).toBeDisabled();
    await friend.locator('#play').click();
    await expect(friend.locator('#squad-command-hud')).toHaveAttribute(
      'data-order',
      'attack',
    );
    await friend.keyboard.press('z');
    await expect(page.locator('#squad-order-state')).toContainText('Friend');
    await friend.keyboard.press('Escape');
    await page.locator('#mode-select').selectOption('arena');
    await expect(friend.locator('#control-hud')).toBeHidden();
    await expect(friend.locator('#squad-command-hud')).toBeHidden();
    await expect(friend.locator('#scene canvas')).toHaveAttribute(
      'data-control',
      'false',
    );
  } finally {
    await context.close();
  }
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
