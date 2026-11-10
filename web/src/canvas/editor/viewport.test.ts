import { afterEach, describe, expect, it } from 'vitest'

import { readViewport, writeViewport } from './viewport'

afterEach(() => {
  window.localStorage.clear()
})

describe('canvas viewport persistence', () => {
  it('round-trips a viewport per canvas', () => {
    writeViewport('canvas-a', { x: 10, y: -20, zoom: 1.25 })
    expect(readViewport('canvas-a')).toEqual({ x: 10, y: -20, zoom: 1.25 })
    expect(readViewport('canvas-b')).toBeNull()
  })

  it('keeps mobile and desktop viewports separate', () => {
    writeViewport('canvas-a', { x: 10, y: -20, zoom: 1.25 })
    writeViewport('canvas-a', { x: 80, y: 40, zoom: 0.65 }, 'mobile')
    expect(readViewport('canvas-a')).toEqual({ x: 10, y: -20, zoom: 1.25 })
    expect(readViewport('canvas-a', 'mobile')).toEqual({ x: 80, y: 40, zoom: 0.65 })
  })

  it('rejects invalid stored data', () => {
    window.localStorage.setItem('canvas:viewport:v2:bad', JSON.stringify({ x: 0, y: 0, zoom: 0 }))
    window.localStorage.setItem('canvas:viewport:v2:mobile:bad', JSON.stringify({ x: 0, y: 0, zoom: 0 }))
    expect(readViewport('bad')).toBeNull()
    expect(readViewport('bad', 'mobile')).toBeNull()
  })
})
