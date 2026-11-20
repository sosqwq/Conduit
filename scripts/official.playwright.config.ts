import { defineConfig } from '@playwright/test';
import { baseConfig } from './official-specs/specs/e2e/playwright.base';

for (const variable of ['UI_BASE', 'API_BASE']) {
  const hostname = new URL(process.env[variable]!).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    throw new Error(`${variable} must identify a local test service`);
  }
}

export default defineConfig({
  ...baseConfig,
  tsconfig: './official.tsconfig.json',
  testDir: './official-specs/specs/e2e',
  use: { ...baseConfig.use, baseURL: process.env.UI_BASE },
});
