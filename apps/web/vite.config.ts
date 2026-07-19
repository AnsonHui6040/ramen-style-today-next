import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'prepare-sites-worker',
      closeBundle() {
        const serverDirectory = resolve(import.meta.dirname, 'dist/server')
        mkdirSync(serverDirectory, { recursive: true })
        copyFileSync(
          resolve(import.meta.dirname, 'sites-worker.js'),
          resolve(serverDirectory, 'index.js'),
        )
      },
    },
  ],
  build: { outDir: 'dist/client' },
  server: { port: 4173 },
  preview: { port: 4173 },
})
