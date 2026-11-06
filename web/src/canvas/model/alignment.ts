export interface AlignmentItem {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface AlignmentBox {
  id: string
  left: number
  top: number
  right: number
  bottom: number
  centerX: number
  centerY: number
}

export interface AlignmentGuide {
  axis: 'x' | 'y'
  position: number
  start: number
  end: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: AlignmentGuide[]
}

export function alignmentBox(item: AlignmentItem): AlignmentBox {
  return {
    id: item.id,
    left: item.x,
    top: item.y,
    right: item.x + item.width,
    bottom: item.y + item.height,
    centerX: item.x + item.width / 2,
    centerY: item.y + item.height / 2,
  }
}

function unionBoxes(boxes: AlignmentBox[]): AlignmentBox {
  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return {
    id: 'moving',
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  }
}

interface AxisSnap {
  delta: number
  guide: AlignmentGuide
}

function bestSnap(
  moving: AlignmentBox,
  others: AlignmentBox[],
  axis: 'x' | 'y',
  threshold: number,
): AxisSnap | null {
  const movingValues = axis === 'x'
    ? [moving.left, moving.centerX, moving.right]
    : [moving.top, moving.centerY, moving.bottom]
  let best: { distance: number; delta: number; value: number; box: AlignmentBox } | null = null

  for (const box of others) {
    const values = axis === 'x'
      ? [box.left, box.centerX, box.right]
      : [box.top, box.centerY, box.bottom]
    for (const value of values) {
      for (const movingValue of movingValues) {
        const delta = value - movingValue
        const distance = Math.abs(delta)
        if (distance > threshold) continue
        if (!best || distance < best.distance) {
          best = { distance, delta, value, box }
        }
      }
    }
  }

  if (!best) return null
  if (axis === 'x') {
    return {
      delta: best.delta,
      guide: {
        axis,
        position: best.value,
        start: Math.min(moving.top, best.box.top) - 32,
        end: Math.max(moving.bottom, best.box.bottom) + 32,
      },
    }
  }
  return {
    delta: best.delta,
    guide: {
      axis,
      position: best.value,
      start: Math.min(moving.left, best.box.left) - 32,
      end: Math.max(moving.right, best.box.right) + 32,
    },
  }
}

export function findSnap(
  movingItems: AlignmentItem[],
  otherItems: AlignmentItem[],
  threshold = 8,
): SnapResult {
  if (movingItems.length === 0 || otherItems.length === 0) {
    return { dx: 0, dy: 0, guides: [] }
  }
  const moving = unionBoxes(movingItems.map(alignmentBox))
  const others = otherItems.map(alignmentBox)
  const x = bestSnap(moving, others, 'x', threshold)
  const y = bestSnap(moving, others, 'y', threshold)
  return {
    dx: x?.delta ?? 0,
    dy: y?.delta ?? 0,
    guides: [x?.guide, y?.guide].filter((guide): guide is AlignmentGuide => Boolean(guide)),
  }
}
