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

export function withCaptureFooter(
  dataUrl: string,
  footer: string,
  background: string,
): Promise<string> {
  if (!footer.trim() || typeof document === 'undefined') return Promise.resolve(dataUrl)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const footerHeight = Math.max(28, Math.round(image.height * 0.035))
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height + footerHeight
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(dataUrl)
        return
      }
      context.drawImage(image, 0, 0)
      context.fillStyle = background && background !== 'rgba(0, 0, 0, 0)'
        ? background
        : '#f8fafc'
      context.fillRect(0, image.height, canvas.width, footerHeight)
      context.fillStyle = '#475569'
      context.font = `${Math.max(12, Math.round(footerHeight * 0.42))}px ui-sans-serif, system-ui, sans-serif`
      context.textBaseline = 'middle'
      context.fillText(
        footer,
        Math.max(10, Math.round(footerHeight * 0.6)),
        image.height + footerHeight / 2,
        canvas.width - 20,
      )
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

export function downloadText(text: string, filename: string, mediaType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mediaType }))
  downloadUrl(url, filename)
  URL.revokeObjectURL(url)
}
