import '@testing-library/jest-dom/vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver


const localStorageMock = (() => {
  const values = new Map<string, string>()
  return {
    clear() { values.clear() },
    getItem(key: string) { return values.get(key) ?? null },
    key(index: number) { return [...values.keys()][index] ?? null },
    removeItem(key: string) { values.delete(key) },
    setItem(key: string, value: string) { values.set(key, String(value)) },
    get length() { return values.size },
  }
})()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})
