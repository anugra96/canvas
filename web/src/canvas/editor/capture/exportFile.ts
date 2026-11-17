export function safeFileTitle(value: string, fallback = 'canvas'): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback
}

export function captureDimensions(bounds: { width: number; height: number }): {
  width: number
  height: number
} {
  const longEdge = 1600
  const ratio = bounds.width / Math.max(bounds.height, 1)
  if (ratio >= 1) {
    return { width: longEdge, height: Math.max(240, Math.round(longEdge / ratio)) }
  }
  return { width: Math.max(240, Math.round(longEdge * ratio)), height: longEdge }
}

export function downloadUrl(url: string, filename: string): void {
  const link = window.document.createElement('a')
  link.download = filename
  link.href = url
  link.click()
}

export function downloadText(text: string, filename: string, mediaType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mediaType }))
  downloadUrl(url, filename)
  URL.revokeObjectURL(url)
}
