import { useEffect, useRef } from 'react'

const AUTOSAVE_DELAY_MS = 1200
const MAX_RETRY_DELAY_MS = 30_000

/** Debounce for a normal edit; doubles after each failed save, capped at 30 s. */
export function autosaveDelay(failures: number): number {
  return Math.min(AUTOSAVE_DELAY_MS * 2 ** Math.max(0, failures), MAX_RETRY_DELAY_MS)
}

/** A fetch rejection (not an HTTP error) or an offline browser means the API is unreachable. */
export function isNetworkFailure(cause: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return cause instanceof TypeError
}

/**
 * Keeps unsaved work from being lost when the page goes away.
 * Prompts before unload while work is unsaved, flushes when the tab is hidden,
 * and flushes when the browser comes back online.
 */
export function useLeaveGuard(unsaved: boolean, flush: () => void) {
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  useEffect(() => {
    if (!unsaved) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers require a return value to show the prompt.
      event.returnValue = ''
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushRef.current()
    }
    const onOnline = () => flushRef.current()
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [unsaved])
}
