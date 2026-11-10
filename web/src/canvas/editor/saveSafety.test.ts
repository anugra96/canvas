import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { autosaveDelay, useLeaveGuard } from './saveSafety'

describe('save safety', () => {
  it.each([
    [0, 1200],
    [1, 2400],
    [3, 9600],
    [10, 30_000],
  ])('waits %i failed saves -> %i ms before the next autosave', (failures, delay) => {
    expect(autosaveDelay(failures)).toBe(delay)
  })

  it('blocks unload and flushes on hide only while work is unsaved', () => {
    const flush = vi.fn()
    const { rerender } = renderHook(({ unsaved }) => useLeaveGuard(unsaved, flush), {
      initialProps: { unsaved: true },
    })

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(flush).toHaveBeenCalledTimes(1)

    rerender({ unsaved: false })
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(flush).toHaveBeenCalledTimes(1)
  })
})
