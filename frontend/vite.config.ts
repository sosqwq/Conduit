import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const proxy = {
  '/api': { target: process.env.CONDUIT_API_TARGET ?? 'http://127.0.0.1:8080', changeOrigin: true },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: asset => asset.names.includes('default-avatar.svg')
          ? 'assets/default-avatar.svg'
          : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
