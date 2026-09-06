import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base,
  testDir: './tests/performance',
  outputDir: 'test-results/performance',
  timeout: 45000,
  projects: base.projects?.filter((p) => p.name === 'firefox') ?? [],
});
