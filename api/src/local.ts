import { resolve } from 'node:path'

import { serve } from '@hono/node-server'

import { createApp } from './app'
import type { AuthMode } from './auth'
import { FileCanvasStore } from './store/fileCanvasStore'
import { S3CanvasStore } from './store/s3CanvasStore'

const port = Number(process.env.CANVAS_API_PORT ?? 8787)
const dataDir = resolve(process.env.CANVAS_DATA_DIR ?? './.data')
const authMode: AuthMode = process.env.CANVAS_AUTH_MODE === 'cognito' ? 'cognito' : 'local'
const storeMode = process.env.CANVAS_STORE === 's3' ? 's3' : 'file'
const store = storeMode === 's3'
  ? new S3CanvasStore({
    bucket: process.env.CANVAS_S3_BUCKET ?? 'canvas',
    region: process.env.CANVAS_S3_REGION,
    endpoint: process.env.CANVAS_S3_ENDPOINT,
    accessKeyId: process.env.CANVAS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.CANVAS_S3_SECRET_ACCESS_KEY,
  })
  : new FileCanvasStore(dataDir)
const app = createApp(store, {
  authMode,
  corsOrigin: process.env.CANVAS_CORS_ORIGIN,
})

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Canvas API: http://127.0.0.1:${info.port}`)
  console.log(`Canvas data: ${dataDir}`)
  console.log(`Auth mode: ${authMode}`)
  console.log(`Store mode: ${storeMode}`)
})
