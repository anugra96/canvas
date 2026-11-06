import { resolve } from 'node:path'

import { serve } from '@hono/node-server'

import { createApp } from './app'
import type { AuthMode } from './auth'
import { FileCanvasStore } from './store/fileCanvasStore'

const port = Number(process.env.CANVAS_API_PORT ?? 8787)
const dataDir = resolve(process.env.CANVAS_DATA_DIR ?? './.data')
const authMode: AuthMode = process.env.CANVAS_AUTH_MODE === 'cognito' ? 'cognito' : 'local'
const store = new FileCanvasStore(dataDir)
const app = createApp(store, {
  authMode,
  corsOrigin: process.env.CANVAS_CORS_ORIGIN,
})

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Skyward Canvas API: http://127.0.0.1:${info.port}`)
  console.log(`Canvas data: ${dataDir}`)
  console.log(`Auth mode: ${authMode}`)
})
