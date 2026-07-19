import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isGitHubPages = process.env.GITHUB_PAGES === 'true'
const base = isGitHubPages ? '/ramen-style-today-next/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'prepare-sites-worker',
      closeBundle() {
        const clientDirectory = resolve(import.meta.dirname, 'dist/client')
        for (const route of ['questionnaire', 'results', 'finder']) {
          const routeDirectory = resolve(clientDirectory, route)
          mkdirSync(routeDirectory, { recursive: true })
          copyFileSync(
            resolve(clientDirectory, 'index.html'),
            resolve(routeDirectory, 'index.html'),
          )
        }
        if (isGitHubPages) {
          copyFileSync(
            resolve(clientDirectory, 'index.html'),
            resolve(clientDirectory, '404.html'),
          )
        }
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
