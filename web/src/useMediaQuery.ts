import { useCallback, useSyncExternalStore } from 'react'

function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((listener: () => void) => {
    if (!canMatchMedia()) return () => {}
    const media = window.matchMedia(query)
    media.addEventListener('change', listener)
    return () => { media.removeEventListener('change', listener) }
  }, [query])

  return useSyncExternalStore(
    subscribe,
    () => canMatchMedia() && window.matchMedia(query).matches,
    () => false,
  )
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 720px), (max-height: 520px) and (pointer: coarse)')
}

export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
