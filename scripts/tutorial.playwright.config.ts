import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '../frontend/e2e',
  forbidOnly: true,
  reporter: 'list',
  use: { baseURL: process.env.UI_BASE || 'http://127.0.0.1:5173' },
})
