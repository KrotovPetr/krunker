import { ARENA, movingTargets } from '../../packages/game-core/src/index.js';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, browserName }) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in Chromium headless shell is deferred by request.',
  );
  await page.goto('/');
  await page.getByLabel('Твой ник').fill('Solo');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
});

test('timed range accepts shots, finishes, preserves a record and can restart', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('#mode-select').selectOption('training');
  await expect(page.locator('#challenge-actions')).toBeVisible();
  await page.locator('#start-challenge').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#solo-hud')).toHaveAttribute(
    'data-status',
    'running',
  );
  await page.mouse.down();
  // Aim through the same mouse input path as a player, using the displayed tick.
  await expect(async () => {
    const state = await page
      .locator('#movement-hud')
      .evaluate((el) => ({ ...el.dataset }));
    const index = Number(
      await page.locator('#solo-hud').getAttribute('data-target'),
    );
    const target = movingTargets(ARENA, Math.max(0, Number(state.tick) - 6))[
      index
    ];
    if (target) {
      const dx = target.position.x - Number(state.x),
        dz = target.position.z - Number(state.z);
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(
        target.position.y + 1 - (Number(state.y) + 1.65),
        Math.hypot(dx, dz),
      );
      await page.evaluate(
        ({ x, y }) =>
          document.dispatchEvent(
            new MouseEvent('mousemove', { movementX: x, movementY: y }),
          ),
        {
          x: (Number(state.yaw) - yaw) / 0.002,
          y: (Number(state.pitch) - pitch) / 0.002,
        },
      );
    }
    expect(
      Number(await page.locator('#solo-hud').getAttribute('data-hits')),
    ).toBeGreaterThan(0);
  }).toPass({ timeout: 4000, intervals: [50, 80, 100] });
  await page.mouse.up();
  await expect(page.locator('#solo-hud')).toHaveAttribute(
    'data-status',
    'finished',
    { timeout: 10_000 },
  );
  await expect(page.locator('#solo-title')).toHaveText('Финиш!');
  await expect(page.locator('#solo-best')).toContainText('Новый личный рекорд');
  await page.screenshot({ path: test.info().outputPath('range-result.png') });
  const saved = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('fps.record.'))
      .map((key) => localStorage.getItem(key)),
  );
  expect(saved).toHaveLength(1);
  expect(JSON.parse(saved[0]!)).toMatchObject({
    kind: 'training',
    duration: 6,
  });
  await page.keyboard.press('f');
  await expect(page.locator('#solo-hud')).toHaveAttribute('data-run', '2');
  await page.keyboard.press('Escape');
  await page.locator('#cancel-challenge').click();
  await expect(page.locator('#solo-hud')).toHaveAttribute(
    'data-status',
    'idle',
  );
  await page.locator('#leave').click();
  await page.reload();
  await page.getByLabel('Твой ник').fill('Solo again');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#mode-select').selectOption('training');
  await page.locator('#start-challenge').click();
  await expect(page.locator('#solo-best')).toContainText('Рекорд ·');
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});

test('one human can fight three bots and change difficulty from the menu', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('#mode-select').selectOption('bots');
  await expect(page.locator('#players li')).toHaveCount(4);
  await page.locator('#bot-difficulty').selectOption('hard');
  await page.locator('#play').click();
  await expect(page.locator('#match-time')).toHaveAttribute(
    'data-phase',
    'active',
  );
  await expect
    .poll(
      async () =>
        Number(await page.locator('#health').getAttribute('data-value')),
      { timeout: 20_000 },
    )
    .toBeLessThan(100);
  await page.screenshot({ path: test.info().outputPath('bot-match.png') });
  await page.keyboard.press('Escape');
  await page.locator('#mode-select').selectOption('parkour');
  await expect(page.locator('#players li')).toHaveCount(1);
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});

test('parkour runs through the first gate and restarts from the start line', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('#mode-select').selectOption('parkour');
  await page.locator('#start-challenge').click();
  await expect(page.locator('#solo-hud')).toHaveAttribute(
    'data-status',
    'running',
  );
  await page.keyboard.down('w');
  await expect(page.locator('#solo-hud')).toHaveAttribute(
    'data-checkpoint',
    '1',
  );
  await page.keyboard.up('w');
  await page.screenshot({ path: test.info().outputPath('parkour-gates.png') });
  await page.keyboard.press('f');
  await expect(page.locator('#solo-hud')).toHaveAttribute('data-run', '2');
  await expect(page.locator('#solo-hud')).toHaveAttribute(
    'data-checkpoint',
    '0',
  );
  await expect
    .poll(async () =>
      Number(await page.locator('#movement-hud').getAttribute('data-z')),
    )
    .toBeCloseTo(10, 0);
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
