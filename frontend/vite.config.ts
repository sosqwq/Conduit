import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

// Read only the geometry and title at build time. The browser can reserve space
// before the illustration loads, and only downloads the SVG for the open chapter.
const tutorialFigures: Plugin = {
  name: 'tutorial-figure',
  enforce: 'pre',
  async load(id) {
    if (!id.endsWith('.svg?tutorial-figure')) return
    const file = id.slice(0, id.indexOf('?'))
    const svg = await readFile(file, 'utf8')
    const box = /\bviewBox="0 0 (\d+) (\d+)"/.exec(svg)
    const title = /<title\b[^>]*>([^<]+)<\/title>/.exec(svg)
    if (!box || !title) throw new Error(`Missing viewBox or title in ${file}`)
    const metadata = { title: title[1], width: Number(box[1]), height: Number(box[2]) }
    const asset = JSON.stringify(`./${basename(file)}?url&no-inline`)
    return `import url from ${asset}; export default { url, ...${JSON.stringify(metadata)} }`
  },
}

const proxy = {
  // Preserve the browser-facing Host so Spring recognizes same-origin requests through Vite.
  '/api': { target: process.env.CONDUIT_API_TARGET ?? 'http://127.0.0.1:8080', changeOrigin: false },
}

export default defineConfig({
  plugins: [react(), tutorialFigures],
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
