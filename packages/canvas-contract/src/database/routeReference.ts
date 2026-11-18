import type { CanvasEdge, CanvasNode } from '../jsonCanvas'
import { getEntityMeta } from '../ontology'
import { nodeTableDefinition } from './model'

export interface ReferenceRoutePoint {
  x: number
  y: number
}

export type ReferenceRouteSide = 'left' | 'right'

export interface ReferenceRouteEdge {
  fromNode: string
  toNode: string
  fromColumn?: string
  toColumn?: string
  fromSide?: string
  toSide?: string
}

export interface ReferenceRouteOptions {
  clearance?: number
  separation?: number
  reserved?: ReferenceRoutePoint[][]
}

interface Rect {
  id: string
  left: number
  right: number
  top: number
  bottom: number
}

interface Segment {
  start: ReferenceRoutePoint
  end: ReferenceRoutePoint
}

const TABLE_HEADER = 58
const COLUMN_ROW = 26
const DEFAULT_CLEARANCE = 8
const DEFAULT_SEPARATION = 8
const STUB = 12
const BEND_PENALTY = 30
const OVERLAP_PENALTY = 10000
const MAX_OFFSET_LANES = 4
const HORIZONTAL = 1
const VERTICAL = 2

class MinHeap {
  private readonly items: number[] = []
  private readonly costs: number[] = []
  private readonly order: number[] = []

  push(item: number, cost: number, order: number): void {
    this.items.push(item)
    this.costs.push(cost)
    this.order.push(order)
    let index = this.items.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (!this.less(index, parent)) break
      this.swap(index, parent)
      index = parent
    }
  }

  pop(): number | undefined {
    if (this.items.length === 0) return undefined
    const top = this.items[0]!
    const lastItem = this.items.pop()!
    const lastCost = this.costs.pop()!
    const lastOrder = this.order.pop()!
    if (this.items.length > 0) {
      this.items[0] = lastItem
      this.costs[0] = lastCost
      this.order[0] = lastOrder
      let index = 0
      while (true) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < this.items.length && this.less(left, smallest)) smallest = left
        if (right < this.items.length && this.less(right, smallest)) smallest = right
        if (smallest === index) break
        this.swap(index, smallest)
        index = smallest
      }
    }
    return top
  }

  get size(): number {
    return this.items.length
  }

  private less(left: number, right: number): boolean {
    if (this.costs[left]! !== this.costs[right]!) return this.costs[left]! < this.costs[right]!
    if (this.order[left]! !== this.order[right]!) return this.order[left]! < this.order[right]!
    return this.items[left]! < this.items[right]!
  }

  private swap(left: number, right: number): void {
    const item = this.items[left]!
    this.items[left] = this.items[right]!
    this.items[right] = item
    const cost = this.costs[left]!
    this.costs[left] = this.costs[right]!
    this.costs[right] = cost
    const order = this.order[left]!
    this.order[left] = this.order[right]!
    this.order[right] = order
  }
}

function side(value: string | undefined, fallback: ReferenceRouteSide): ReferenceRouteSide {
  return value === 'left' || value === 'right' ? value : fallback
}

function inferredSides(
  child: CanvasNode,
  parent: CanvasNode,
): { fromSide: ReferenceRouteSide; toSide: ReferenceRouteSide } {
  if (child.x >= parent.x + parent.width) return { fromSide: 'left', toSide: 'right' }
  if (child.x + child.width <= parent.x) return { fromSide: 'right', toSide: 'left' }
  return { fromSide: 'right', toSide: 'right' }
}

function columnPoint(
  node: CanvasNode,
  column: string | undefined,
  handleSide: ReferenceRouteSide,
): ReferenceRoutePoint | undefined {
  if (!column) return undefined
  const definition = nodeTableDefinition(node)
  const index = definition?.columns.findIndex((candidate) => candidate.name === column) ?? -1
  if (index < 0) return undefined
  return {
    x: handleSide === 'left' ? node.x : node.x + node.width,
    y: node.y + TABLE_HEADER + index * COLUMN_ROW + COLUMN_ROW / 2,
  }
}

function isPointInside(point: ReferenceRoutePoint, rect: Rect): boolean {
  return point.x > rect.left
    && point.x < rect.right
    && point.y > rect.top
    && point.y < rect.bottom
}

function segmentHitsRect(start: ReferenceRoutePoint, end: ReferenceRoutePoint, rect: Rect): boolean {
  if (start.x === end.x) {
    if (start.x <= rect.left || start.x >= rect.right) return false
    const top = Math.min(start.y, end.y)
    const bottom = Math.max(start.y, end.y)
    return bottom > rect.top && top < rect.bottom
  }
  if (start.y === end.y) {
    if (start.y <= rect.top || start.y >= rect.bottom) return false
    const left = Math.min(start.x, end.x)
    const right = Math.max(start.x, end.x)
    return right > rect.left && left < rect.right
  }
  return true
}

function segmentHitsObstacles(
  start: ReferenceRoutePoint,
  end: ReferenceRoutePoint,
  obstacles: Rect[],
): boolean {
  return obstacles.some((rect) => segmentHitsRect(start, end, rect))
}

function segmentsOf(points: ReferenceRoutePoint[]): Segment[] {
  const segments: Segment[] = []
  for (let index = 1; index < points.length; index += 1) {
    segments.push({ start: points[index - 1]!, end: points[index]! })
  }
  return segments
}

function overlapPenalty(
  start: ReferenceRoutePoint,
  end: ReferenceRoutePoint,
  reserved: Segment[],
  separation: number,
): number {
  let penalty = 0
  for (const segment of reserved) {
    const vertical = start.x === end.x && segment.start.x === segment.end.x
    if (vertical) {
      if (Math.abs(start.x - segment.start.x) >= separation) continue
      const top = Math.min(start.y, end.y)
      const bottom = Math.max(start.y, end.y)
      const otherTop = Math.min(segment.start.y, segment.end.y)
      const otherBottom = Math.max(segment.start.y, segment.end.y)
      if (bottom > otherTop && top < otherBottom) penalty += OVERLAP_PENALTY
      continue
    }
    const horizontal = start.y === end.y && segment.start.y === segment.end.y
    if (!horizontal) continue
    if (Math.abs(start.y - segment.start.y) >= separation) continue
    const left = Math.min(start.x, end.x)
    const right = Math.max(start.x, end.x)
    const otherLeft = Math.min(segment.start.x, segment.end.x)
    const otherRight = Math.max(segment.start.x, segment.end.x)
    if (right > otherLeft && left < otherRight) penalty += OVERLAP_PENALTY
  }
  return penalty
}

function simplify(points: ReferenceRoutePoint[]): ReferenceRoutePoint[] {
  const unique: ReferenceRoutePoint[] = []
  for (const point of points) {
    const previous = unique[unique.length - 1]
    if (!previous || previous.x !== point.x || previous.y !== point.y) unique.push(point)
  }
  const result: ReferenceRoutePoint[] = []
  for (const point of unique) {
    while (result.length >= 2) {
      const first = result[result.length - 2]!
      const second = result[result.length - 1]!
      const sameX = first.x === second.x && second.x === point.x
      const sameY = first.y === second.y && second.y === point.y
      if (!sameX && !sameY) break
      result.pop()
    }
    result.push(point)
  }
  return result
}

function routeClear(points: ReferenceRoutePoint[], obstacles: Rect[]): boolean {
  for (const segment of segmentsOf(points)) {
    if (segmentHitsObstacles(segment.start, segment.end, obstacles)) return false
  }
  return true
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right)
}

function stateKey(x: number, y: number, direction: number, width: number): number {
  return ((y * width) + x) * 3 + direction
}

function routeWithSearch(
  start: ReferenceRoutePoint,
  end: ReferenceRoutePoint,
  exit: ReferenceRoutePoint,
  entry: ReferenceRoutePoint,
  obstacles: Rect[],
  reserved: Segment[],
  separation: number,
): ReferenceRoutePoint[] | undefined {
  const baseXs = new Set<number>([start.x, end.x, exit.x, entry.x])
  const baseYs = new Set<number>([start.y, end.y, exit.y, entry.y])
  for (const rect of obstacles) {
    baseXs.add(rect.left)
    baseXs.add(rect.right)
    baseYs.add(rect.top)
    baseYs.add(rect.bottom)
  }
  if (reserved.length > 0) {
    for (const value of [...baseXs]) {
      for (let lane = 1; lane <= MAX_OFFSET_LANES; lane += 1) {
        baseXs.add(value + lane * separation)
        baseXs.add(value - lane * separation)
      }
    }
    for (const value of [...baseYs]) {
      for (let lane = 1; lane <= MAX_OFFSET_LANES; lane += 1) {
        baseYs.add(value + lane * separation)
        baseYs.add(value - lane * separation)
      }
    }
  }
  const xs = uniqueSorted([...baseXs])
  const ys = uniqueSorted([...baseYs])
  const xIndex = new Map(xs.map((value, index) => [value, index]))
  const yIndex = new Map(ys.map((value, index) => [value, index]))
  const startX = xIndex.get(exit.x)
  const startY = yIndex.get(exit.y)
  const goalX = xIndex.get(entry.x)
  const goalY = yIndex.get(entry.y)
  if (startX === undefined || startY === undefined || goalX === undefined || goalY === undefined) {
    return undefined
  }

  const width = xs.length
  const height = ys.length
  const stateCount = width * height * 3
  const costs = new Float64Array(stateCount)
  costs.fill(Number.POSITIVE_INFINITY)
  const previous = new Int32Array(stateCount)
  previous.fill(-1)
  const heap = new MinHeap()
  let order = 0

  const startState = stateKey(startX, startY, HORIZONTAL, width)
  costs[startState] = 0
  heap.push(startState, Math.abs(exit.x - entry.x) + Math.abs(exit.y - entry.y), order)
  order += 1

  let goalState: number | undefined
  while (heap.size > 0) {
    const state = heap.pop()!
    const cost = costs[state]!
    const direction = state % 3
    const cell = (state - direction) / 3
    const y = Math.floor(cell / width)
    const x = cell - y * width
    const point = { x: xs[x]!, y: ys[y]! }
    if (x === goalX && y === goalY) {
      if (goalState === undefined || cost < costs[goalState]!) goalState = state
      break
    }
    const moves: Array<{ nextX: number; nextY: number; nextDirection: number }> = []
    if (x > 0) moves.push({ nextX: x - 1, nextY: y, nextDirection: HORIZONTAL })
    if (x + 1 < width) moves.push({ nextX: x + 1, nextY: y, nextDirection: HORIZONTAL })
    if (y > 0) moves.push({ nextX: x, nextY: y - 1, nextDirection: VERTICAL })
    if (y + 1 < height) moves.push({ nextX: x, nextY: y + 1, nextDirection: VERTICAL })
    for (const move of moves) {
      const nextPoint = { x: xs[move.nextX]!, y: ys[move.nextY]! }
      if (obstacles.some((rect) => isPointInside(nextPoint, rect))) continue
      if (segmentHitsObstacles(point, nextPoint, obstacles)) continue
      const distance = Math.abs(nextPoint.x - point.x) + Math.abs(nextPoint.y - point.y)
      const bend = move.nextDirection === direction ? 0 : BEND_PENALTY
      const overlap = overlapPenalty(point, nextPoint, reserved, separation)
      const nextCost = cost + distance + bend + overlap
      const nextState = stateKey(move.nextX, move.nextY, move.nextDirection, width)
      if (nextCost >= costs[nextState]!) continue
      costs[nextState] = nextCost
      previous[nextState] = state
      const heuristic = Math.abs(nextPoint.x - entry.x) + Math.abs(nextPoint.y - entry.y)
      const finalBend = move.nextDirection === VERTICAL ? BEND_PENALTY : 0
      heap.push(nextState, nextCost + heuristic + finalBend, order)
      order += 1
    }
  }

  if (goalState === undefined) return undefined
  const reverse: ReferenceRoutePoint[] = []
  let current = goalState
  while (current >= 0) {
    const direction = current % 3
    const cell = (current - direction) / 3
    const y = Math.floor(cell / width)
    const x = cell - y * width
    reverse.push({ x: xs[x]!, y: ys[y]! })
    current = previous[current]!
  }
  reverse.reverse()
  const points = simplify([start, ...reverse, end])
  if (!routeClear(points, obstacles)) return undefined
  return points
}

function routeFor(
  edge: ReferenceRouteEdge,
  cards: CanvasNode[],
  options: ReferenceRouteOptions,
): ReferenceRoutePoint[] | undefined {
  const child = cards.find((card) => card.id === edge.fromNode)
  const parent = cards.find((card) => card.id === edge.toNode)
  if (!child || !parent) return undefined
  const inferred = inferredSides(child, parent)
  const fromSide = side(edge.fromSide, inferred.fromSide)
  const toSide = side(edge.toSide, inferred.toSide)
  const start = columnPoint(child, edge.fromColumn, fromSide)
  const end = columnPoint(parent, edge.toColumn, toSide)
  if (!start || !end) return undefined

  const clearance = options.clearance ?? DEFAULT_CLEARANCE
  const separation = options.separation ?? DEFAULT_SEPARATION
  const obstacles: Rect[] = []
  for (const card of cards) {
    if (getEntityMeta(card)?.entityType === 'db_schema') continue
    const margin = card.id === child.id || card.id === parent.id ? 0 : clearance
    obstacles.push({
      id: card.id,
      left: card.x - margin,
      right: card.x + card.width + margin,
      top: card.y - margin,
      bottom: card.y + card.height + margin,
    })
  }

  if (child.id === parent.id && fromSide === toSide) {
    const loopX = fromSide === 'right'
      ? child.x + child.width + STUB
      : child.x - STUB
    const loop = simplify([
      start,
      { x: loopX, y: start.y },
      { x: loopX, y: end.y },
      end,
    ])
    if (routeClear(loop, obstacles)) return loop
  }

  const exit = {
    x: start.x + (fromSide === 'left' ? -STUB : STUB),
    y: start.y,
  }
  const entry = {
    x: end.x + (toSide === 'left' ? -STUB : STUB),
    y: end.y,
  }
  if (obstacles.some((rect) => isPointInside(exit, rect) || isPointInside(entry, rect))) {
    return undefined
  }
  const reserved = (options.reserved ?? []).flatMap((points) => segmentsOf(points))
  return routeWithSearch(start, end, exit, entry, obstacles, reserved, separation)
}

export function routeReference(
  edge: ReferenceRouteEdge,
  cards: CanvasNode[],
  options: ReferenceRouteOptions = {},
): ReferenceRoutePoint[] | undefined {
  return routeFor(edge, cards, options)
}

export function routeReferences(
  edges: ReferenceRouteEdge[],
  cards: CanvasNode[],
  options: ReferenceRouteOptions = {},
): Array<ReferenceRoutePoint[] | undefined> {
  const order = edges
    .map((edge, index) => ({ edge, index }))
    .sort((left, right) => (
      left.edge.fromNode.localeCompare(right.edge.fromNode)
      || (left.edge.fromColumn ?? '').localeCompare(right.edge.fromColumn ?? '')
      || left.edge.toNode.localeCompare(right.edge.toNode)
      || (left.edge.toColumn ?? '').localeCompare(right.edge.toColumn ?? '')
      || left.index - right.index
    ))
  const reserved: ReferenceRoutePoint[][] = []
  const result: Array<ReferenceRoutePoint[] | undefined> = new Array(edges.length)
  for (const { edge, index } of order) {
    const route = routeFor(edge, cards, { ...options, reserved })
    result[index] = route
    if (route) reserved.push(route)
  }
  return result
}

export function referenceRouteEdge(edge: CanvasEdge): ReferenceRouteEdge {
  const meta = (edge.app ?? {}) as Record<string, unknown>
  return {
    fromNode: edge.fromNode,
    toNode: edge.toNode,
    ...(typeof meta.fromColumn === 'string' ? { fromColumn: meta.fromColumn } : {}),
    ...(typeof meta.toColumn === 'string' ? { toColumn: meta.toColumn } : {}),
    ...(edge.fromSide ? { fromSide: edge.fromSide } : {}),
    ...(edge.toSide ? { toSide: edge.toSide } : {}),
  }
}

export function referenceRoutePath(
  points: ReferenceRoutePoint[],
  radius = 8,
): { path: string; label: ReferenceRoutePoint } {
  if (points.length === 0) return { path: '', label: { x: 0, y: 0 } }
  if (points.length === 1) return { path: `M ${points[0]!.x} ${points[0]!.y}`, label: points[0]! }
  const parts: string[] = [`M ${points[0]!.x} ${points[0]!.y}`]
  let total = 0
  const lengths: number[] = []
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.abs(points[index]!.x - points[index - 1]!.x)
      + Math.abs(points[index]!.y - points[index - 1]!.y)
    lengths.push(length)
    total += length
  }
  let label = points[0]!
  let walked = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!
    const point = points[index]!
    const length = lengths[index - 1]!
    const next = points[index + 1]
    if (next && length > radius * 2) {
      const incoming = {
        x: point.x + (previous.x - point.x) / length * radius,
        y: point.y + (previous.y - point.y) / length * radius,
      }
      const outgoingLength = Math.abs(next.x - point.x) + Math.abs(next.y - point.y)
      const outgoing = outgoingLength > 0
        ? {
          x: point.x + (next.x - point.x) / outgoingLength * radius,
          y: point.y + (next.y - point.y) / outgoingLength * radius,
        }
        : point
      parts.push(`L ${incoming.x} ${incoming.y}`)
      parts.push(`Q ${point.x} ${point.y} ${outgoing.x} ${outgoing.y}`)
    } else {
      parts.push(`L ${point.x} ${point.y}`)
    }
    if (total > 0 && walked + length >= total / 2 && label === points[0]) {
      const ratio = length > 0 ? (total / 2 - walked) / length : 0
      label = {
        x: previous.x + (point.x - previous.x) * ratio,
        y: previous.y + (point.y - previous.y) * ratio,
      }
    }
    walked += length
  }
  return { path: parts.join(' '), label }
}
