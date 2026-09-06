import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: 'pnpm start',
      env: { HOST: '127.0.0.1', PORT: '2568', NODE_ENV: 'test' },
      url: 'http://127.0.0.1:2568/health',
      reuseExistingServer: false,
    },
    {
      command:
        'pnpm --filter @fps/client exec vite build --outDir dist-e2e && pnpm --filter @fps/client exec vite preview --host 127.0.0.1 --port 4174 --strictPort --outDir dist-e2e',
      env: { VITE_SERVER_URL: 'http://127.0.0.1:2568' },
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
    },
  ],
});
