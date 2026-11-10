import { nodeDimensions, type CanvasFlowNode } from '../../model/adapter'

interface PlacementBounds {
  topLeft: { x: number; y: number }
  bottomRight: { x: number; y: number }
}

export interface PlacementInput {
  base: { x: number; y: number }
  width: number
  height: number
  nodes: CanvasFlowNode[]
  bounds?: PlacementBounds
}

export interface Placement {
  x: number
  y: number
  visible: boolean
}

export function findPlacementPosition({
  base,
  width,
  height,
  nodes,
  bounds,
}: PlacementInput): Placement {
  const gap = 24
  const stepX = width + gap
  const stepY = height + gap
  const occupied = nodes.filter((node) => node.type !== 'group')
  const isFree = (x: number, y: number) => occupied.every((node) => {
    const size = nodeDimensions(node)
    return x + width + gap <= node.position.x
      || x >= node.position.x + size.width + gap
      || y + height + gap <= node.position.y
      || y >= node.position.y + size.height + gap
  })
  const isVisible = (x: number, y: number) => (
    !bounds
    || (
      x >= bounds.topLeft.x + 16
      && y >= bounds.topLeft.y + 16
      && x + width <= bounds.bottomRight.x - 16
      && y + height <= bounds.bottomRight.y - 16
    )
  )

  let offscreen: { x: number; y: number } | undefined
  for (let radius = 0; radius <= 4; radius += 1) {
    for (let row = -radius; row <= radius; row += 1) {
      for (let column = -radius; column <= radius; column += 1) {
        if (Math.max(Math.abs(row), Math.abs(column)) !== radius) continue
        const x = base.x + column * stepX
        const y = base.y + row * stepY
        if (!isFree(x, y)) continue
        if (isVisible(x, y)) return { x, y, visible: true }
        offscreen ??= { x, y }
      }
    }
  }
  if (offscreen) return { ...offscreen, visible: false }
  const offset = (nodes.length % 6) * 52
  return { x: base.x + offset, y: base.y + offset, visible: false }
}
