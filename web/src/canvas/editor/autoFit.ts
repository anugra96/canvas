const MIN_WIDTH = 260
const MAX_WIDTH = 1200
const WIDTH_FACTORS = [0.5, 0.65, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]
const COMMON_WIDTHS = [240, 320, 400, 480, 560, 640, 720, 860, 1000]

export interface CardSize {
  width: number
  height: number
}

function clampWidth(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)))
}

function measureHeight(element: HTMLElement, width: number): number {
  const clone = element.cloneNode(true) as HTMLElement
  clone.classList.add('autofit-measure')
  clone.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'height:auto',
    'max-height:none',
    'overflow:visible',
    'visibility:hidden',
    'pointer-events:none',
    'z-index:-1',
    `width:${width}px`,
  ].join(';')
  for (const child of clone.querySelectorAll<HTMLElement>(
    '.entity-card, .entity-body, .node-text, .code-card, .code-body, .code-notes',
  )) {
    child.style.height = 'auto'
    child.style.maxHeight = 'none'
    child.style.overflow = 'visible'
    if (child.classList.contains('entity-body') || child.classList.contains('code-body')) {
      child.style.flex = '0 0 auto'
    }
  }
  document.body.appendChild(clone)
  const height = Math.ceil(clone.getBoundingClientRect().height)
  clone.remove()
  return height
}

export function findBestCardSize(
  element: HTMLElement,
  currentWidth: number,
  currentHeight: number,
): CardSize {
  if (currentWidth <= 0 || currentHeight <= 0) {
    return { width: currentWidth, height: currentHeight }
  }
  const currentAspect = currentWidth / currentHeight
  const widths = new Set<number>()
  for (const factor of WIDTH_FACTORS) widths.add(clampWidth(currentWidth * factor))
  for (const width of COMMON_WIDTHS) widths.add(clampWidth(width))
  widths.add(clampWidth(currentWidth))

  let best: { width: number; height: number; score: number } | undefined
  for (const width of widths) {
    const height = measureHeight(element, width)
    if (height <= 0) continue
    const aspectDelta = Math.abs(Math.log((width / height) / currentAspect))
    const sizeDelta = Math.abs(Math.log(width / currentWidth)) * 0.08
      + Math.abs(Math.log(height / currentHeight)) * 0.04
    const score = aspectDelta + sizeDelta
    if (!best || score < best.score) best = { width, height, score }
  }

  return best
    ? { width: best.width, height: Math.max(80, best.height) }
    : { width: currentWidth, height: currentHeight }
}
