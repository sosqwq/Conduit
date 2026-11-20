import { defineConfig } from '@playwright/test';
import { baseConfig } from './official-specs/specs/e2e/playwright.base';

export default defineConfig({
  ...baseConfig,
  testDir: './official-specs/specs/e2e',
  use: { ...baseConfig.use, baseURL: process.env.UI_BASE },
});
