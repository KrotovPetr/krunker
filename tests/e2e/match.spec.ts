import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function join(page: Page, name: string, invite = '/') {
  await page.goto(invite);
  await page.getByLabel('Твой ник').fill(name);
  await page.locator('#join').click();
  await expect(page.locator('#status')).toHaveText('В комнате');
  await expect(page.locator('#play')).toBeEnabled();
}
async function position(page: Page) {
  return page.locator('#movement-hud').evaluate((el) => ({
    x: Number(el.dataset.x),
    y: Number(el.dataset.y),
    z: Number(el.dataset.z),
    yaw: Number(el.dataset.yaw),
    pitch: Number(el.dataset.pitch),
  }));
}

test('two players choose classes, finish a round and start the next', async ({
  browser,
}) => {
  test.setTimeout(45000);
  const firstContext = await browser.newContext(),
    secondContext = await browser.newContext();
  const first = await firstContext.newPage(),
    second = await secondContext.newPage();
  const errors: string[] = [];
  for (const page of [first, second])
    page.on('pageerror', (error) => errors.push(error.message));
  try {
    await join(first, 'Alice');
    await first.locator('#weapon-select').selectOption('sniper');
    await expect(first.locator('#weapon-name')).toHaveText('Снайперка');
    await join(second, 'Bob', await first.locator('#invite').inputValue());
    await first.locator('#ready').click();
    await second.locator('#ready').click();
    for (const page of [first, second]) {
      await expect(page.locator('#match-time')).toHaveAttribute(
        'data-phase',
        'active',
      );
      await expect(page.locator('#weapon-select')).toBeDisabled();
    }
    await first.locator('#scores').click();
    await expect(first.locator('#scoreboard')).toBeVisible();
    await expect(first.locator('#score-rows')).toContainText('Alice');
    await expect(first.locator('#score-rows')).toContainText('Снайперка');
    await first.locator('#close-scores').click();
    await expect(first.locator('#scoreboard')).toBeHidden();
    await expect(first.locator('#match-time')).toHaveAttribute(
      'data-phase',
      'results',
      { timeout: 25000 },
    );
    await expect(first.locator('#score-title')).toHaveText('Ничья');
    await expect(second.locator('#scoreboard')).toBeVisible();
    await first.screenshot({ path: test.info().outputPath('results.png') });
    await expect(first.locator('#match-time')).toHaveAttribute(
      'data-round',
      '2',
      { timeout: 5000 },
    );
    await expect(second.locator('#match-time')).toHaveAttribute(
      'data-phase',
      'active',
    );
    expect(errors).toEqual([]);
    await first.locator('#leave').click();
    await second.locator('#leave').click();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('a browser reconnects after a network interruption', async ({
  page,
  context,
}) => {
  await join(page, 'Reconnect');
  const invite = await page.locator('#invite').inputValue();
  await page.locator('#ready').click();
  await expect(page.locator('#ready')).toBeDisabled();
  await context.setOffline(true);
  // Firefox does not consistently dispatch offline when its emulated network changes.
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('#network-banner')).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('#network-banner')).toBeHidden({ timeout: 10000 });
  await expect(page.locator('#status')).toHaveText('В комнате');
  await expect(page.locator('#player-count')).toHaveText('1 / 8');
  await expect(page.locator('#invite')).toHaveValue(invite);
  await expect(page.locator('#ready')).toBeDisabled();
  await page.locator('#leave').click();
});

test('two browser contexts shoot, score a kill and observe respawn', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in Chromium headless shell is deferred by request.',
  );
  test.setTimeout(30000);
  const firstContext = await browser.newContext(),
    secondContext = await browser.newContext();
  const first = await firstContext.newPage(),
    second = await secondContext.newPage();
  const errors: string[] = [];
  for (const page of [first, second])
    page.on('pageerror', (error) => errors.push(error.message));
  try {
    await join(first, 'Sniper');
    await first.locator('#weapon-select').selectOption('sniper');
    await expect(first.locator('#weapon-name')).toHaveText('Снайперка');
    await join(second, 'Target', await first.locator('#invite').inputValue());
    await first.locator('#ready').click();
    await second.locator('#play').click();
    await expect(second.locator('#app')).toHaveClass(/playing/);
    await expect(first.locator('#match-time')).toHaveAttribute(
      'data-phase',
      'active',
    );
    // Walk along the east side, past the central cover, into the south lane.
    await second.keyboard.down('s');
    await expect
      .poll(async () => (await position(second)).z, {
        timeout: 5000,
        intervals: [30],
      })
      .toBeGreaterThan(9.5);
    await second.keyboard.up('s');
    await expect
      .poll(async () => Number(await second.locator('#speed').textContent()))
      .toBeLessThan(0.1);
    await second.keyboard.press('Escape');
    await first.bringToFront();
    await first.locator('#play').click();
    await expect(first.locator('#app')).toHaveClass(/playing/);
    const a = await position(first),
      b = await position(second);
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    const pitch = Math.atan2(
      b.y + 1.65 - a.y - 1.65,
      Math.hypot(b.x - a.x, b.z - a.z),
    );
    // Exercise the normal mouse-look handler without depending on desktop cursor bounds.
    await first.evaluate(
      ({ yaw, pitch, a }) => {
        document.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: (a.yaw - yaw) / 0.002,
            movementY: (a.pitch - pitch) / 0.002,
          }),
        );
      },
      { yaw, pitch, a },
    );
    await expect
      .poll(async () => Math.abs((await position(first)).yaw - yaw))
      .toBeLessThan(0.01);
    await first.keyboard.press('q');
    await expect(first.locator('#movement-hud')).toHaveAttribute(
      'data-aim',
      '1',
    );
    const life = await second.locator('#health').getAttribute('data-life');
    await first.mouse.down();
    await first.mouse.up();
    await expect(first.locator('#personal-score')).toHaveText(
      '1 убийств · 0 смертей',
    );
    await expect(second.locator('#personal-score')).toHaveText(
      '0 убийств · 1 смертей',
    );
    await expect(second.locator('#health')).not.toHaveAttribute(
      'data-life',
      life!,
    );
    await expect(second.locator('#health')).toHaveAttribute(
      'data-value',
      '100',
    );
    await expect(first.locator('#ammo')).toHaveText('4 / 5');
    await first.keyboard.press('r');
    await expect(first.locator('#ammo')).toContainText('Перезарядка');
    await expect(first.locator('#ammo')).toHaveText('5 / 5');
    await first.keyboard.down('Tab');
    await expect(first.locator('#scoreboard')).toBeVisible();
    await first.screenshot({ path: test.info().outputPath('combat.png') });
    await first.keyboard.up('Tab');
    await first.keyboard.press('Escape');
    expect(errors).toEqual([]);
    await first.locator('#leave').click();
    await second.locator('#leave').click();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
