import { expect, test } from '@playwright/test';

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
  await page.keyboard.press('q');
  await expect(page.locator('#movement-hud')).toHaveAttribute('data-aim', '1');
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
