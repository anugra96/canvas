import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_ONTOLOGY } from '@skyward/canvas-contract'

import { loadOntology } from './loadOntology'

afterEach(() => vi.unstubAllGlobals())

describe('loadOntology', () => {
  it('fetches and validates the runtime ontology', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => DEFAULT_ONTOLOGY,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadOntology('token')).resolves.toEqual(DEFAULT_ONTOLOGY)
    expect(fetchMock).toHaveBeenCalledWith('/v1/ontology', expect.objectContaining({
      headers: { authorization: 'Bearer token' },
    }))
  })

  it('rejects an invalid ontology', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 'bad', entityTypes: [], relationTypes: [] }),
    }))
    await expect(loadOntology('token')).rejects.toThrow('invalid')
  })
})
