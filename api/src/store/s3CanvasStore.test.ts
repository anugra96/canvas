import type { S3Client } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'

import type { CanvasPrincipal } from '../auth'
import { CanvasConflictError } from './canvasStore'
import { S3CanvasStore } from './s3CanvasStore'

const principal: CanvasPrincipal = {
  subject: 'local-dev',
  displayName: 'Local Dev',
  email: 'dev@localhost',
  groups: ['canvas-editors'],
  tenantId: 'local',
}

function fakeClient() {
  const objects = new Map<string, string>()
  const client = {
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const name = command.constructor.name
      if (name === 'HeadBucketCommand') return {}
      if (name === 'PutObjectCommand') {
        objects.set(String(command.input.Key), String(command.input.Body))
        return {}
      }
      if (name === 'GetObjectCommand') {
        const body = objects.get(String(command.input.Key))
        if (body === undefined) {
          const error = new Error('Not found')
          error.name = 'NoSuchKey'
          throw error
        }
        return { Body: { transformToString: async () => body } }
      }
      if (name === 'CopyObjectCommand') {
        const source = String(command.input.CopySource).replace(/^[^/]+\//, '')
        const body = objects.get(source)
        if (body === undefined) throw new Error(`Missing copy source ${source}`)
        objects.set(String(command.input.Key), body)
        return {}
      }
      if (name === 'DeleteObjectCommand') {
        objects.delete(String(command.input.Key))
        return {}
      }
      if (name === 'ListObjectsV2Command') {
        const prefix = String(command.input.Prefix ?? '')
        return {
          IsTruncated: false,
          Contents: [...objects.keys()]
            .filter((key) => key.startsWith(prefix))
            .map((Key) => ({ Key })),
        }
      }
      throw new Error(`Unexpected command ${name}`)
    },
  }
  return { client: client as unknown as S3Client, objects }
}

describe('S3CanvasStore', () => {
  it('creates, reads, saves, and lists canvases', async () => {
    const { client, objects } = fakeClient()
    const store = new S3CanvasStore({ bucket: 'canvas-test' }, client)
    const created = await store.create('local', 'Test canvas', principal)
    expect(created.title).toBe('Test canvas')
    expect(objects.size).toBe(1)

    const read = await store.get('local', created.id)
    expect(read?.id).toBe(created.id)

    const saved = await store.save(
      'local',
      created.id,
      { nodes: [], edges: [] },
      created.etag,
      principal,
    )
    expect(saved.etag).not.toBe(created.etag)
    expect(read?.etag).toBe(created.etag)

    await store.create('local', 'Second canvas', principal)
    const list = await store.list('local')
    expect(list.map((canvas) => canvas.title).sort()).toEqual(['Second canvas', 'Test canvas'])
    expect(list[0]).toMatchObject({ nodeCount: 0, edgeCount: 0, profile: 'raw' })
  })

  it('rejects a stale save', async () => {
    const { client } = fakeClient()
    const store = new S3CanvasStore({ bucket: 'canvas-test' }, client)
    const created = await store.create('local', 'Conflict canvas', principal)
    await expect(store.save('local', created.id, { nodes: [], edges: [] }, 'stale', principal))
      .rejects.toBeInstanceOf(CanvasConflictError)
  })

  it('moves a removed canvas outside the listed prefix', async () => {
    const { client, objects } = fakeClient()
    const store = new S3CanvasStore({ bucket: 'canvas-test' }, client)
    const created = await store.create('local', 'Removed canvas', principal)

    await store.remove('local', created.id, created.etag)

    expect(await store.list('local')).toHaveLength(0)
    expect([...objects.keys()]).toEqual([`tenants/local/deleted/${created.id}.json`])
  })
})
