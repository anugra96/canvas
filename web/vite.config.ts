import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'

const apiTarget = `http://127.0.0.1:${process.env.CANVAS_API_PORT ?? '8787'}`
const require = createRequire(import.meta.url)
const wasmFile = require.resolve('libpg-query/wasm/libpg-query.wasm')

function databaseWasmPlugin(): Plugin {
  function serveWasm(server: ViteDevServer | PreviewServer) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== '/libpg-query.wasm') {
        next()
        return
      }
      response.setHeader('Content-Type', 'application/wasm')
      response.end(readFileSync(wasmFile))
    })
  }
  return {
    name: 'canvas-database-wasm',
    configureServer: serveWasm,
    configurePreviewServer: serveWasm,
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'libpg-query.wasm',
        source: readFileSync(wasmFile),
      })
    },
  }
}

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  envDir: '..',
  plugins: [react(), databaseWasmPlugin()],
  build: {
    chunkSizeWarningLimit: 510_000, // Lazy Tiptap loads only while editing text; other oversize chunks still warn.
    modulePreload: {
      resolveDependencies: (_filename, dependencies) => dependencies.filter((dependency) => (
        !dependency.includes('database-parser')
      )),
    },
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'database-parser',
              test: /node_modules[\\/](libpg-query|pgsql-deparser|@pgsql)/,
              priority: 5,
            },
            {
              name: 'flow',
              test: /node_modules[\\/](@xyflow|d3-|zustand)/,
              priority: 3,
            },
            {
              name: 'editor',
              test: /node_modules[\\/](@tiptap|prosemirror)/,
              priority: 2,
            },
            {
              name: 'vendor',
              test: /node_modules/,
              priority: 1,
              maxSize: 500_000,
            },
          ],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/v1': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/v1': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
