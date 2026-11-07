import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_ONTOLOGY } from '@canvas/contract'

import { loadOntology, resetOntologyCache } from './ontology'

const directories: string[] = []
const previousPath = process.env.CANVAS_ONTOLOGY_PATH

afterEach(async () => {
  resetOntologyCache()
  if (previousPath === undefined) delete process.env.CANVAS_ONTOLOGY_PATH
  else process.env.CANVAS_ONTOLOGY_PATH = previousPath
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('loadOntology', () => {
  it('falls back to the built-in ontology when no file is configured', async () => {
    delete process.env.CANVAS_ONTOLOGY_PATH
    expect(await loadOntology()).toEqual(DEFAULT_ONTOLOGY)
  })

  it('loads and validates a configured ontology file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'app-canvas-ontology-'))
    directories.push(directory)
    const path = join(directory, 'ontology.json')
    await writeFile(path, JSON.stringify({ ...DEFAULT_ONTOLOGY, version: 'runtime-test' }))
    process.env.CANVAS_ONTOLOGY_PATH = path

    const ontology = await loadOntology()
    expect(ontology.version).toBe('runtime-test')
  })

  it('falls back when the configured file is invalid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'app-canvas-ontology-'))
    directories.push(directory)
    const path = join(directory, 'ontology.json')
    await writeFile(path, JSON.stringify({ version: 'bad', entityTypes: [], relationTypes: [] }))
    process.env.CANVAS_ONTOLOGY_PATH = path

    expect(await loadOntology()).toEqual(DEFAULT_ONTOLOGY)
  })
})
