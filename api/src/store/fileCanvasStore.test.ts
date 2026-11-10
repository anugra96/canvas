import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { localPrincipal } from '../auth'
import { CanvasConflictError } from './canvasStore'
import { FileCanvasStore } from './fileCanvasStore'

const directories: string[] = []

async function createStore(): Promise<FileCanvasStore> {
  const directory = await mkdtemp(join(tmpdir(), 'app-canvas-'))
  directories.push(directory)
  return new FileCanvasStore(directory)
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('FileCanvasStore', () => {
  it('persists a canvas across store instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'app-canvas-'))
    directories.push(directory)
    const principal = localPrincipal()
    const store = new FileCanvasStore(directory)
    const created = await store.create('app', 'Persisted', principal)
    const saved = await store.save(
      'app',
      created.id,
      {
        nodes: [
          { id: 'card-a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Saved' },
        ],
        edges: [],
      },
      created.etag,
      principal,
    )

    const reopened = new FileCanvasStore(directory)
    const loaded = await reopened.get('app', created.id)
    expect(loaded?.etag).toBe(saved.etag)
    expect(loaded?.canvas.nodes?.[0]).toMatchObject({ text: 'Saved' })

    const listed = await reopened.list('app')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ id: created.id, nodeCount: 1 })
  })

  it('rejects a stale etag', async () => {
    const store = await createStore()
    const principal = localPrincipal()
    const created = await store.create('app', 'Conflict', principal)
    const first = await store.save(
      'app',
      created.id,
      { nodes: [], edges: [] },
      created.etag,
      principal,
    )

    await expect(
      store.save('app', created.id, { nodes: [], edges: [] }, created.etag, principal),
    ).rejects.toBeInstanceOf(CanvasConflictError)
    expect(first.etag).not.toBe(created.etag)
  })

  it('hides a removed canvas but keeps its file recoverable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'app-canvas-'))
    directories.push(directory)
    const store = new FileCanvasStore(directory)
    const created = await store.create('app', 'Removed', localPrincipal())

    await store.remove('app', created.id, created.etag)

    expect(await store.get('app', created.id)).toBeNull()
    expect(await store.list('app')).toHaveLength(0)
    const kept = JSON.parse(await readFile(join(directory, 'app', '.deleted', `${created.id}.json`), 'utf8'))
    expect(kept.title).toBe('Removed')
  })
})
