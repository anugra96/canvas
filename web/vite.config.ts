import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const apiTarget = `http://127.0.0.1:${process.env.CANVAS_API_PORT ?? '8787'}`

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  envDir: '..',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
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
