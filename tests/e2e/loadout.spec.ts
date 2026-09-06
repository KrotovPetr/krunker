import { expect, test } from '@playwright/test';

test('class cards explain the loadout and the machine gun fires automatically with a long reload', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in Chromium headless shell is deferred by request.',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Твой ник').fill('Gunner');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  const classes = [
    ['sniper', 'Снайпер'],
    ['shotgun', 'Тяжёлый боец'],
    ['smg', 'Разведчик'],
    ['revolver', 'Стрелок'],
    ['rifle', 'Штурмовик'],
    ['lmg', 'Пулемётчик'],
  ];
  for (const [weapon, name] of classes) {
    await page.locator('#weapon-select').selectOption(weapon!);
    await expect(page.locator('#class-name')).toHaveText(name!);
    await expect(page.locator('#weapon-description')).not.toBeEmpty();
    await expect(page.locator('#class-tradeoff')).not.toBeEmpty();
  }
  await expect(page.locator('#class-ammo')).toHaveText('100 + 300');
  await expect(page.locator('#class-reload')).toHaveText('6 с');
  await expect(page.locator('#class-speed')).toHaveText('5.1 м/с');
  await expect(page.locator('#class-rate')).toHaveText('720 / мин');
  await page
    .locator('#class-card')
    .screenshot({ path: test.info().outputPath('class-card.png') });
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('#class-card')).toBeHidden();
  await expect(page.locator('#weapon-name')).toHaveText('Пулемёт «Титан»');
  await expect(page.locator('#ammo')).toHaveText('100 / 100');
  await expect(page.locator('#ammo-reserve')).toHaveText('ЗАПАС 300');
  await page.mouse.down();
  await expect
    .poll(async () =>
      Number((await page.locator('#ammo').innerText()).split(' / ')[0]),
    )
    .toBeLessThanOrEqual(88);
  await page.mouse.up();
  // Let the final fire command reach the authoritative snapshot before reloading.
  const releaseTick = Number(
    await page.locator('#movement-hud').getAttribute('data-tick'),
  );
  await expect
    .poll(async () =>
      Number(await page.locator('#movement-hud').getAttribute('data-tick')),
    )
    .toBeGreaterThanOrEqual(releaseTick + 15);
  const remaining = Number(
    (await page.locator('#ammo').innerText()).split(' / ')[0],
  );
  await page.keyboard.press('r');
  await expect(page.locator('#ammo')).toContainText('Перезарядка');
  await expect(page.locator('#ammo')).toHaveText('100 / 100', {
    timeout: 8000,
  });
  await expect(page.locator('#ammo-reserve')).toHaveText(
    `ЗАПАС ${300 - (100 - remaining)}`,
  );
  await page.screenshot({ path: test.info().outputPath('machine-gun.png') });
  await page.keyboard.press('Escape');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});

test('pistol has its own magazine and Web Audio starts after entering the arena', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'chromium',
    'Pointer lock in Chromium headless shell is deferred by request.',
  );
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      constructor() {
        super();
        this.addEventListener('statechange', () => {
          document.documentElement.dataset.audioState = this.state;
        });
      }
      override createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (when = 0, offset = 0, duration?: number) => {
          document.documentElement.dataset.audioVoices = String(
            Number(document.documentElement.dataset.audioVoices ?? 0) + 1,
          );
          start(when, offset, duration);
        };
        return source;
      }
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Твой ник').fill('Pistol');
  await page.locator('#join').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveClass(/playing/);
  await expect(page.locator('html')).toHaveAttribute(
    'data-audio-state',
    'running',
  );
  await page.keyboard.press('2');
  await expect(page.locator('#weapon-name')).toHaveText('Пистолет');
  await expect(page.locator('#ammo')).toHaveText('12 / 12');
  const equipTick = Number(
    await page.locator('#movement-hud').getAttribute('data-tick'),
  );
  await page.keyboard.press('q');
  await expect(page.locator('#movement-hud')).toHaveAttribute('data-aim', '1');
  // ADS completes before the 0.22s weapon-switch lockout. Wait for simulation
  // progress so this single click tests a ready pistol, not a rejected early shot.
  await expect
    .poll(async () =>
      Number(await page.locator('#movement-hud').getAttribute('data-tick')),
    )
    .toBeGreaterThanOrEqual(equipTick + 15);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#ammo')).toHaveText('11 / 12');
  await expect
    .poll(async () =>
      Number(await page.locator('html').getAttribute('data-audio-voices')),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press('r');
  await expect(page.locator('#ammo')).toContainText('Перезарядка');
  await expect(page.locator('#ammo')).toHaveText('12 / 12');
  await page.keyboard.press('1');
  await expect(page.locator('#weapon-name')).toHaveText('Автомат');
  await expect(page.locator('#ammo')).toHaveText('30 / 30');
  await page.screenshot({ path: test.info().outputPath('weapons.png') });
  await page.keyboard.press('Escape');
  await page.getByLabel('Громкость').fill('0');
  await page.locator('#leave').click();
  expect(errors).toEqual([]);
});
