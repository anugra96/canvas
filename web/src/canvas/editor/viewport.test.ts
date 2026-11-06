import { afterEach, describe, expect, it } from 'vitest'

import { clearViewport, readViewport, writeViewport } from './viewport'

afterEach(() => {
  window.localStorage.clear()
})

describe('canvas viewport persistence', () => {
  it('round-trips a viewport per canvas', () => {
    writeViewport('canvas-a', { x: 10, y: -20, zoom: 1.25 })
    expect(readViewport('canvas-a')).toEqual({ x: 10, y: -20, zoom: 1.25 })
    expect(readViewport('canvas-b')).toBeNull()
  })

  it('rejects invalid stored data', () => {
    window.localStorage.setItem('skyward-canvas:viewport:v2:bad', JSON.stringify({ x: 0, y: 0, zoom: 0 }))
    expect(readViewport('bad')).toBeNull()
  })

  it('clears a stored viewport', () => {
    writeViewport('canvas-a', { x: 0, y: 0, zoom: 1 })
    clearViewport('canvas-a')
    expect(readViewport('canvas-a')).toBeNull()
  })
})
