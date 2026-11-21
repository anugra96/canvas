import dagre from '@dagrejs/dagre'

import { edgeClass } from '../edgeClasses'
import type { CanvasEdge, CanvasNode, JsonCanvas } from '../jsonCanvas'
import { getGroupMembers } from '../ontology'

export type Point = { x: number; y: number }
export type Sizes = Record<string, { width: number; height: number }>

export type LayoutScope =
  | { kind: 'place'; nodeIds: string[]; base?: Point }
  | { kind: 'replan' }

export interface LayoutMove {
  id: string
  from: Point
  to: Point
  reason: string
}

export interface GroupResize {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface GroupJoin {
  groupId: string
  nodeId: string
}

export interface LayoutPlan {
  moves: LayoutMove[]
  groupResizes: GroupResize[]
  joins: GroupJoin[]
}

const CARD_GAP = 24
const GROUP_PADDING = 24
const GROUP_LABEL_HEIGHT = 40
const NODE_SEP = 72
const RANK_SEP = 150
const SEARCH_RADIUS = 4
const NEIGHBOUR_GAP = 90
const ROOT_BLOCK = '\u0000root'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface LayoutItem {
  id: string
  width: number
  height: number
}

interface LayoutEdge {
  id: string
  source: string
  target: string
  edge: CanvasEdge
}

interface Membership {
  parent: Map<string, string>
  groups: CanvasNode[]
}

interface GroupLayout {
  size: { width: number; height: number }
  cardOffsets: Map<string, Point>
  groupBoxes: Map<string, Rect>
}

interface PlanContext {
  canvas: JsonCanvas
  nodes: CanvasNode[]
  nodeById: Map<string, CanvasNode>
  sizes?: Sizes
  parent: Map<string, string>
  groups: CanvasNode[]
}

function nodeRect(node: CanvasNode, sizes?: Sizes): Rect {
  const measured = sizes?.[node.id]
  const width = measured && Number.isFinite(measured.width) && measured.width > 0
    ? measured.width
    : node.width
  const height = measured && Number.isFinite(measured.height) && measured.height > 0
    ? measured.height
    : node.height
  return { x: node.x, y: node.y, width, height }
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function rectUnion(rects: Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function rectsOverlap(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height
}

function rectsApart(left: Rect, right: Rect, gap: number): boolean {
  return left.x + left.width + gap <= right.x
    || right.x + right.width + gap <= left.x
    || left.y + left.height + gap <= right.y
    || right.y + right.height + gap <= left.y
}

function containsRect(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}

export function containsPoint(outer: Rect, point: Point): boolean {
  return point.x >= outer.x
    && point.y >= outer.y
    && point.x <= outer.x + outer.width
    && point.y <= outer.y + outer.height
}

function insideGroup(rect: Rect, group: Rect): boolean {
  return rect.x >= group.x + GROUP_PADDING
    && rect.y >= group.y + GROUP_LABEL_HEIGHT
    && rect.x + rect.width <= group.x + group.width - GROUP_PADDING
    && rect.y + rect.height <= group.y + group.height - GROUP_PADDING
}

function paddedGroupBounds(rects: Rect[]): Rect | undefined {
  const union = rectUnion(rects)
  if (!union) return undefined
  return {
    x: union.x - GROUP_PADDING,
    y: union.y - GROUP_LABEL_HEIGHT,
    width: union.width + GROUP_PADDING * 2,
    height: union.height + GROUP_LABEL_HEIGHT + GROUP_PADDING,
  }
}

function growRect(current: Rect, next: Rect): Rect {
  const left = Math.min(current.x, next.x)
  const top = Math.min(current.y, next.y)
  const right = Math.max(current.x + current.width, next.x + next.width)
  const bottom = Math.max(current.y + current.height, next.y + next.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function sameRect(left: Rect, right: Rect): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id))
}

function resolveMembership(
  nodes: CanvasNode[],
  sizes: Sizes | undefined,
  ignoreImplicit: Set<string>,
): Membership {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const groups = sortById(nodes.filter((node) => node.type === 'group'))
  const parent = new Map<string, string>()

  for (const group of groups) {
    const members = getGroupMembers(group)
    if (members === undefined) continue
    for (const nodeId of [...new Set(members)].sort()) {
      if (nodeId === group.id || !nodeById.has(nodeId) || parent.has(nodeId)) continue
      parent.set(nodeId, group.id)
    }
  }

  const implicitGroups = groups
    .filter((group) => getGroupMembers(group) === undefined)
    .map((group) => ({ group, area: nodeRect(group, sizes).width * nodeRect(group, sizes).height }))
    .sort((left, right) => left.area - right.area || left.group.id.localeCompare(right.group.id))

  for (const { group } of implicitGroups) {
    const groupRect = nodeRect(group, sizes)
    for (const candidate of sortById(nodes)) {
      if (candidate.id === group.id || parent.has(candidate.id) || ignoreImplicit.has(candidate.id)) continue
      const candidateRect = nodeRect(candidate, sizes)
      // A card belongs to the smallest raw group holding its centre (cards often overflow a lane edge);
      // a nested group must fit fully inside.
      if (candidate.type === 'group') {
        if (!containsRect(groupRect, candidateRect) || containsRect(candidateRect, groupRect)) continue
      } else if (!containsPoint(groupRect, rectCenter(candidateRect))) {
        continue
      }
      parent.set(candidate.id, group.id)
    }
  }

  for (const group of groups) {
    const seen = new Set<string>()
    let current: string | undefined = group.id
    while (current !== undefined && parent.has(current)) {
      if (seen.has(current)) {
        parent.delete(current)
        break
      }
      seen.add(current)
      current = parent.get(current)
    }
  }

  return { parent, groups }
}

function layoutItems(items: LayoutItem[], edges: LayoutEdge[]): Map<string, Point> {
  const positions = new Map<string, Point>()
  if (items.length === 0) return positions
  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({
    rankdir: 'LR',
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 0,
    marginy: 0,
  })
  graph.setDefaultEdgeLabel(() => ({}))
  const sortedItems = sortById(items)
  for (const item of sortedItems) {
    graph.setNode(item.id, { width: item.width, height: item.height })
  }
  const usedEdgeIds = new Set<string>()
  for (const edge of sortById(edges)) {
    if (edge.source === edge.target) continue
    let edgeId = edge.id
    let suffix = 0
    while (usedEdgeIds.has(edgeId)) {
      suffix += 1
      edgeId = `${edge.id}:${suffix}`
    }
    usedEdgeIds.add(edgeId)
    graph.setEdge(edge.source, edge.target, { weight: 1 }, edgeId)
  }
  dagre.layout(graph)
  for (const item of sortedItems) {
    const positioned = graph.node(item.id) as { x: number; y: number; width: number; height: number }
    positions.set(item.id, {
      x: positioned.x - positioned.width / 2,
      y: positioned.y - positioned.height / 2,
    })
  }
  return positions
}

function blockEdges(
  context: PlanContext,
  itemFor: (nodeId: string) => string | undefined,
  preferFlow = true,
): LayoutEdge[] {
  const nodeById = context.nodeById
  const crossing: LayoutEdge[] = []
  for (const edge of context.canvas.edges ?? []) {
    const source = itemFor(edge.fromNode)
    const target = itemFor(edge.toNode)
    if (!source || !target || source === target) continue
    crossing.push({ id: edge.id, source, target, edge })
  }
  if (!preferFlow) return crossing
  const flow = crossing.filter(({ edge }) => (
    edgeClass(edge, nodeById.get(edge.fromNode), nodeById.get(edge.toNode)) === 'flow'
  ))
  return flow.length > 0 ? flow : crossing
}

function layoutGroup(groupId: string, context: PlanContext): GroupLayout {
  const group = context.nodeById.get(groupId)
  if (!group) {
    return { size: { width: 0, height: 0 }, cardOffsets: new Map(), groupBoxes: new Map() }
  }
  const childCards = context.nodes
    .filter((node) => node.type !== 'group' && context.parent.get(node.id) === groupId)
  const childGroups = context.groups.filter((candidate) => context.parent.get(candidate.id) === groupId)
  const childLayouts = new Map<string, GroupLayout>()
  for (const child of childGroups) {
    childLayouts.set(child.id, layoutGroup(child.id, context))
  }
  const items: LayoutItem[] = [
    ...childCards.map((card) => {
      const rect = nodeRect(card, context.sizes)
      return { id: card.id, width: rect.width, height: rect.height }
    }),
    ...childGroups.map((child) => {
      const size = childLayouts.get(child.id)?.size ?? { width: 0, height: 0 }
      return { id: child.id, width: size.width, height: size.height }
    }),
  ]
  const itemIds = new Set(items.map((item) => item.id))
  const itemFor = (nodeId: string): string | undefined => {
    let current: string | undefined = nodeId
    const seen = new Set<string>()
    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      if (context.parent.get(current) === groupId) {
        return itemIds.has(current) ? current : undefined
      }
      current = context.parent.get(current)
    }
    return undefined
  }

  if (items.length === 0) {
    const rect = nodeRect(group, context.sizes)
    return {
      size: { width: rect.width, height: rect.height },
      cardOffsets: new Map(),
      groupBoxes: new Map(),
    }
  }

  const positions = layoutItems(items, blockEdges(context, itemFor))
  const left = Math.min(...items.map((item) => positions.get(item.id)!.x))
  const top = Math.min(...items.map((item) => positions.get(item.id)!.y))
  const right = Math.max(...items.map((item) => positions.get(item.id)!.x + item.width))
  const bottom = Math.max(...items.map((item) => positions.get(item.id)!.y + item.height))
  const origin = {
    x: left - GROUP_PADDING,
    y: top - GROUP_LABEL_HEIGHT,
  }
  const size = {
    width: right - left + GROUP_PADDING * 2,
    height: bottom - top + GROUP_LABEL_HEIGHT + GROUP_PADDING,
  }
  const cardOffsets = new Map<string, Point>()
  const groupBoxes = new Map<string, Rect>()

  for (const card of childCards) {
    const position = positions.get(card.id)!
    cardOffsets.set(card.id, {
      x: position.x - origin.x,
      y: position.y - origin.y,
    })
  }
  for (const child of childGroups) {
    const childLayout = childLayouts.get(child.id)!
    const position = positions.get(child.id)!
    const childX = position.x - origin.x
    const childY = position.y - origin.y
    groupBoxes.set(child.id, {
      x: childX,
      y: childY,
      width: childLayout.size.width,
      height: childLayout.size.height,
    })
    for (const [cardId, offset] of childLayout.cardOffsets) {
      cardOffsets.set(cardId, { x: childX + offset.x, y: childY + offset.y })
    }
    for (const [nestedId, box] of childLayout.groupBoxes) {
      groupBoxes.set(nestedId, { x: childX + box.x, y: childY + box.y, width: box.width, height: box.height })
    }
  }

  return { size, cardOffsets, groupBoxes }
}

function layoutRootBlock(context: PlanContext): GroupLayout {
  const cards = context.nodes.filter((node) => node.type !== 'group' && !context.parent.has(node.id))
  const items: LayoutItem[] = cards.map((card) => {
    const rect = nodeRect(card, context.sizes)
    return { id: card.id, width: rect.width, height: rect.height }
  })
  const itemIds = new Set(items.map((item) => item.id))
  const itemFor = (nodeId: string) => (itemIds.has(nodeId) ? nodeId : undefined)
  const positions = layoutItems(items, blockEdges(context, itemFor))
  if (items.length === 0) {
    return { size: { width: 0, height: 0 }, cardOffsets: new Map(), groupBoxes: new Map() }
  }
  const left = Math.min(...items.map((item) => positions.get(item.id)!.x))
  const top = Math.min(...items.map((item) => positions.get(item.id)!.y))
  const right = Math.max(...items.map((item) => positions.get(item.id)!.x + item.width))
  const bottom = Math.max(...items.map((item) => positions.get(item.id)!.y + item.height))
  const cardOffsets = new Map<string, Point>()
  for (const card of cards) {
    const position = positions.get(card.id)!
    cardOffsets.set(card.id, { x: position.x - left, y: position.y - top })
  }
  return {
    size: { width: right - left, height: bottom - top },
    cardOffsets,
    groupBoxes: new Map(),
  }
}

function replan(canvas: JsonCanvas, sizes: Sizes | undefined): LayoutPlan {
  const nodes = canvas.nodes ?? []
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const membership = resolveMembership(nodes, sizes, new Set())
  const context: PlanContext = {
    canvas,
    nodes,
    nodeById,
    sizes,
    parent: membership.parent,
    groups: membership.groups,
  }
  const topGroups = membership.groups.filter((group) => !membership.parent.has(group.id))
  const groupLayouts = new Map<string, GroupLayout>()
  for (const group of topGroups) {
    groupLayouts.set(group.id, layoutGroup(group.id, context))
  }
  const rootLayout = layoutRootBlock(context)
  const hasRootCards = rootLayout.cardOffsets.size > 0
  const topItems: LayoutItem[] = [
    ...topGroups.map((group) => {
      const size = groupLayouts.get(group.id)!.size
      return { id: group.id, width: size.width, height: size.height }
    }),
    ...(hasRootCards
      ? [{ id: ROOT_BLOCK, width: rootLayout.size.width, height: rootLayout.size.height }]
      : []),
  ]
  const topItemFor = (nodeId: string): string | undefined => {
    let current: string | undefined = nodeId
    const seen = new Set<string>()
    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      const parentId = membership.parent.get(current)
      if (parentId === undefined) {
        const node = nodeById.get(current)
        if (!node) return undefined
        if (node.type === 'group') return groupLayouts.has(current) ? current : undefined
        return hasRootCards ? ROOT_BLOCK : undefined
      }
      current = parentId
    }
    return undefined
  }
  const topPositions = layoutItems(topItems, blockEdges(context, topItemFor, false))
  const cardPositions = new Map<string, Point>()
  const groupBoxes = new Map<string, Rect>()

  for (const group of topGroups) {
    const layout = groupLayouts.get(group.id)!
    const origin = topPositions.get(group.id) ?? { x: 0, y: 0 }
    groupBoxes.set(group.id, {
      x: origin.x,
      y: origin.y,
      width: layout.size.width,
      height: layout.size.height,
    })
    for (const [cardId, offset] of layout.cardOffsets) {
      cardPositions.set(cardId, { x: origin.x + offset.x, y: origin.y + offset.y })
    }
    for (const [nestedId, box] of layout.groupBoxes) {
      groupBoxes.set(nestedId, {
        x: origin.x + box.x,
        y: origin.y + box.y,
        width: box.width,
        height: box.height,
      })
    }
  }
  if (hasRootCards) {
    const origin = topPositions.get(ROOT_BLOCK) ?? { x: 0, y: 0 }
    for (const [cardId, offset] of rootLayout.cardOffsets) {
      cardPositions.set(cardId, { x: origin.x + offset.x, y: origin.y + offset.y })
    }
  }

  const cards = sortById(nodes.filter((node) => node.type !== 'group'))
  if (cards.length > 0 && cardPositions.size > 0) {
    const before = cards.map((card) => rectCenter(nodeRect(card, sizes)))
    const after = cards.map((card) => {
      const position = cardPositions.get(card.id) ?? { x: card.x, y: card.y }
      const rect = nodeRect(card, sizes)
      return { x: position.x + rect.width / 2, y: position.y + rect.height / 2 }
    })
    const beforeX = before.reduce((total, point) => total + point.x, 0) / before.length
    const beforeY = before.reduce((total, point) => total + point.y, 0) / before.length
    const afterX = after.reduce((total, point) => total + point.x, 0) / after.length
    const afterY = after.reduce((total, point) => total + point.y, 0) / after.length
    const dx = beforeX - afterX
    const dy = beforeY - afterY
    for (const [id, position] of cardPositions) {
      cardPositions.set(id, { x: position.x + dx, y: position.y + dy })
    }
    for (const [id, box] of groupBoxes) {
      groupBoxes.set(id, { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height })
    }
  }

  const moves: LayoutMove[] = []
  for (const card of cards) {
    const position = cardPositions.get(card.id)
    if (!position) continue
    if (position.x === card.x && position.y === card.y) continue
    moves.push({
      id: card.id,
      from: { x: card.x, y: card.y },
      to: position,
      reason: 'replan',
    })
  }
  const groupResizes: GroupResize[] = sortById(membership.groups).map((group) => {
    const box = groupBoxes.get(group.id) ?? nodeRect(group, sizes)
    return { id: group.id, x: box.x, y: box.y, width: box.width, height: box.height }
  })

  return { moves, groupResizes, joins: [] }
}

function connectedIds(canvas: JsonCanvas, nodeId: string): string[] {
  const ids = new Set<string>()
  for (const edge of canvas.edges ?? []) {
    if (edge.fromNode === nodeId) ids.add(edge.toNode)
    if (edge.toNode === nodeId) ids.add(edge.fromNode)
  }
  ids.delete(nodeId)
  return [...ids].sort()
}

function isAncestorOf(parent: Map<string, string>, ancestorId: string, nodeId: string): boolean {
  let current: string | undefined = nodeId
  const seen = new Set<string>()
  while (current !== undefined && !seen.has(current)) {
    seen.add(current)
    if (current === ancestorId) return true
    current = parent.get(current)
  }
  return false
}

function relatedGroups(parent: Map<string, string>, leftId: string, rightId: string): boolean {
  return leftId === rightId
    || isAncestorOf(parent, leftId, rightId)
    || isAncestorOf(parent, rightId, leftId)
}

function groupMemberRects(
  groupId: string,
  context: PlanContext,
  cardRects: Map<string, Rect>,
  groupRects: Map<string, Rect>,
  overrides: Map<string, Rect>,
): Rect[] {
  const rects: Rect[] = []
  for (const [cardId, rect] of cardRects) {
    if (context.parent.get(cardId) === groupId) rects.push(rect)
  }
  for (const group of context.groups) {
    if (group.id === groupId) continue
    if (context.parent.get(group.id) !== groupId) continue
    const rect = overrides.get(group.id) ?? groupRects.get(group.id)
    if (rect) rects.push(rect)
  }
  return rects
}

function proposedGroupGrowth(
  targetGroupId: string,
  placedId: string,
  placedRect: Rect,
  context: PlanContext,
  cardRects: Map<string, Rect>,
  groupRects: Map<string, Rect>,
): { bounds: Map<string, Rect>; changed: Map<string, Rect> } | undefined {
  const bounds = new Map<string, Rect>()
  const changed = new Map<string, Rect>()
  const nextCards = new Map(cardRects)
  nextCards.set(placedId, placedRect)
  let current: string | undefined = targetGroupId

  while (current !== undefined) {
    const group = context.nodeById.get(current)
    if (!group) return undefined
    const memberRects = groupMemberRects(current, context, nextCards, groupRects, bounds)
    if (current === targetGroupId) memberRects.push(placedRect)
    const wrapped = paddedGroupBounds(memberRects)
    const original = groupRects.get(current) ?? nodeRect(group, context.sizes)
    const next = wrapped ? growRect(original, wrapped) : original
    bounds.set(current, next)
    if (!sameRect(original, next)) changed.set(current, next)

    for (const [cardId, rect] of nextCards) {
      if (cardId === placedId) continue
      const belongs = isAncestorOf(context.parent, current, cardId)
      if (!belongs && rectsOverlap(next, rect)) return undefined
    }
    for (const other of context.groups) {
      if (other.id === current || relatedGroups(context.parent, other.id, current)) continue
      const otherRect = groupRects.get(other.id)
      if (otherRect && rectsOverlap(next, otherRect)) return undefined
    }

    current = context.parent.get(current)
  }
  return { bounds, changed }
}

function place(canvas: JsonCanvas, scope: { nodeIds: string[]; base?: Point }, sizes: Sizes | undefined): LayoutPlan {
  const nodes = canvas.nodes ?? []
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const placedIds = [...new Set(scope.nodeIds)]
    .filter((id) => nodeById.get(id)?.type !== 'group' && nodeById.has(id))
    .sort()
  if (placedIds.length === 0) return { moves: [], groupResizes: [], joins: [] }
  const membership = resolveMembership(nodes, sizes, new Set(placedIds))
  const context: PlanContext = {
    canvas,
    nodes,
    nodeById,
    sizes,
    parent: membership.parent,
    groups: membership.groups,
  }
  const cardRects = new Map<string, Rect>()
  const groupRects = new Map<string, Rect>()
  for (const node of nodes) {
    const rect = nodeRect(node, sizes)
    if (node.type === 'group') groupRects.set(node.id, rect)
    else if (!placedIds.includes(node.id)) cardRects.set(node.id, rect)
  }
  const originalGroupRects = new Map(groupRects)
  const positions = new Map<string, Point>()
  const joins: GroupJoin[] = []
  const resizes = new Map<string, Rect>()

  const fallbackCandidates = (width: number, height: number): Point[] => {
    const rects = [
      ...[...cardRects.values()],
      ...[...groupRects.values()],
    ]
    const union = rectUnion(rects)
    if (!union) return [{ x: 0, y: 0 }]
    return [
      { x: union.x + union.width + CARD_GAP, y: union.y },
      { x: union.x, y: union.y + union.height + CARD_GAP },
      { x: union.x - width - CARD_GAP, y: union.y },
      { x: union.x, y: union.y - height - CARD_GAP },
    ]
  }

  // Try each start in order, then rings around the first. Within a ring, stack in the same column first.
  const candidates = function* (starts: Point[], width: number, height: number): Generator<Point> {
    yield* starts
    const base = starts[0]!
    const stepX = width + CARD_GAP
    const stepY = height + CARD_GAP
    for (let radius = 1; radius <= SEARCH_RADIUS; radius += 1) {
      const ring: Array<{ row: number; column: number }> = []
      for (let row = -radius; row <= radius; row += 1) {
        for (let column = -radius; column <= radius; column += 1) {
          if (Math.max(Math.abs(row), Math.abs(column)) === radius) ring.push({ row, column })
        }
      }
      ring.sort((left, right) => (
        Math.abs(left.column) - Math.abs(right.column)
        || Math.abs(left.row) - Math.abs(right.row)
        || left.row - right.row
        || left.column - right.column
      ))
      for (const { row, column } of ring) yield { x: base.x + column * stepX, y: base.y + row * stepY }
    }
  }

  // Aligned slots beside the connected cards: the flow side first (a source sits left of what it points to).
  const besideSlots = (around: Rect, width: number, height: number, isSource: boolean): Point[] => {
    const middleY = around.y + around.height / 2 - height / 2
    const middleX = around.x + around.width / 2 - width / 2
    const right = { x: around.x + around.width + NEIGHBOUR_GAP, y: middleY }
    const left = { x: around.x - width - NEIGHBOUR_GAP, y: middleY }
    return [
      ...(isSource ? [left, right] : [right, left]),
      { x: middleX, y: around.y + around.height + NEIGHBOUR_GAP },
      { x: middleX, y: around.y - height - NEIGHBOUR_GAP },
    ]
  }

  const freeOfCards = (rect: Rect): boolean => (
    [...cardRects.values()].every((other) => rectsApart(rect, other, CARD_GAP))
  )

  const freeOfOtherGroups = (rect: Rect, targetGroupId?: string): boolean => {
    for (const [groupId, other] of groupRects) {
      if (targetGroupId && relatedGroups(membership.parent, groupId, targetGroupId)) continue
      if (rectsOverlap(rect, other)) return false
    }
    return true
  }

  for (const placedId of placedIds) {
    const node = nodeById.get(placedId)!
    const rect = nodeRect(node, sizes)
    const connections = connectedIds(canvas, placedId)
      .filter((id) => nodeById.has(id))
    const connectedCards = connections.filter((id) => nodeById.get(id)!.type !== 'group')
    const connectedGroups = new Set(
      connectedCards
        .map((id) => membership.parent.get(id))
        .filter((id): id is string => id !== undefined),
    )
    const sharedGroup = connectedCards.length > 0
      && connectedGroups.size === 1
      && connectedCards.every((id) => membership.parent.get(id) !== undefined)
      ? [...connectedGroups][0]
      : undefined
    const targetGroup = sharedGroup ?? membership.parent.get(placedId)

    let starts: Point[]
    const union = connections.length > 0
      ? rectUnion(connections.map((id) => {
        const connected = nodeById.get(id)!
        const connectedRect = nodeRect(connected, sizes)
        if (positions.has(id) && connected.type !== 'group') {
          return { ...connectedRect, x: positions.get(id)!.x, y: positions.get(id)!.y }
        }
        return connectedRect
      }))
      : undefined
    if (union) {
      const edges = canvas.edges ?? []
      const outgoing = edges.filter((edge) => edge.fromNode === placedId && edge.toNode !== placedId).length
      const incoming = edges.filter((edge) => edge.toNode === placedId && edge.fromNode !== placedId).length
      starts = besideSlots(union, rect.width, rect.height, outgoing > incoming)
    } else if (scope.base) {
      starts = [scope.base]
    } else {
      starts = [fallbackCandidates(rect.width, rect.height)[0]!]
    }

    let chosen: { position: Point; growth?: Map<string, Rect> } | undefined

    if (targetGroup) {
      const targetRect = groupRects.get(targetGroup)
      if (targetRect) {
        for (const candidate of candidates(starts, rect.width, rect.height)) {
          const candidateRect = { ...rect, x: candidate.x, y: candidate.y }
          if (!insideGroup(candidateRect, targetRect)) continue
          if (!freeOfCards(candidateRect)) continue
          if (!freeOfOtherGroups(candidateRect, targetGroup)) continue
          chosen = { position: candidate }
          break
        }
        if (!chosen) {
          for (const candidate of candidates(starts, rect.width, rect.height)) {
            const candidateRect = { ...rect, x: candidate.x, y: candidate.y }
            if (!freeOfCards(candidateRect)) continue
            if (!freeOfOtherGroups(candidateRect, targetGroup)) continue
            const growth = proposedGroupGrowth(
              targetGroup,
              placedId,
              candidateRect,
              context,
              cardRects,
              groupRects,
            )
            if (!growth) continue
            chosen = { position: candidate, growth: growth.changed }
            break
          }
        }
        if (!chosen) {
          for (const fallback of fallbackCandidates(rect.width, rect.height)) {
            const candidateRect = { ...rect, x: fallback.x, y: fallback.y }
            const growth = proposedGroupGrowth(
              targetGroup,
              placedId,
              candidateRect,
              context,
              cardRects,
              groupRects,
            )
            if (!growth) continue
            chosen = { position: fallback, growth: growth.changed }
            break
          }
        }
      }
    } else {
      for (const candidate of candidates(starts, rect.width, rect.height)) {
        const candidateRect = { ...rect, x: candidate.x, y: candidate.y }
        if (!freeOfCards(candidateRect)) continue
        if (!freeOfOtherGroups(candidateRect)) continue
        chosen = { position: candidate }
        break
      }
      if (!chosen) {
        for (const fallback of fallbackCandidates(rect.width, rect.height)) {
          const candidateRect = { ...rect, x: fallback.x, y: fallback.y }
          if (!freeOfCards(candidateRect)) continue
          if (!freeOfOtherGroups(candidateRect)) continue
          chosen = { position: fallback }
          break
        }
      }
    }

    const position = chosen?.position ?? { x: rect.x, y: rect.y }
    positions.set(placedId, position)
    const placedRect = { ...rect, x: position.x, y: position.y }
    cardRects.set(placedId, placedRect)

    if (targetGroup) {
      if (sharedGroup) {
        membership.parent.set(placedId, sharedGroup)
        joins.push({ groupId: sharedGroup, nodeId: placedId })
      }
      for (const [groupId, next] of chosen?.growth ?? []) {
        groupRects.set(groupId, next)
        resizes.set(groupId, next)
      }
      if (!groupRects.has(targetGroup)) {
        const next = originalGroupRects.get(targetGroup)
        if (next) groupRects.set(targetGroup, next)
      }
    }
  }

  const moves: LayoutMove[] = []
  for (const placedId of placedIds) {
    const node = nodeById.get(placedId)!
    const position = positions.get(placedId) ?? { x: node.x, y: node.y }
    if (position.x === node.x && position.y === node.y) continue
    moves.push({
      id: placedId,
      from: { x: node.x, y: node.y },
      to: position,
      reason: 'place',
    })
  }
  const groupResizes: GroupResize[] = [...resizes]
    .filter(([groupId, rect]) => {
      const original = originalGroupRects.get(groupId)
      return !original || !sameRect(original, rect)
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, rect]) => ({ id, x: rect.x, y: rect.y, width: rect.width, height: rect.height }))
  joins.sort((left, right) => (
    left.groupId.localeCompare(right.groupId) || left.nodeId.localeCompare(right.nodeId)
  ))

  return { moves, groupResizes, joins }
}

export function planLayout(
  canvas: JsonCanvas,
  scope: LayoutScope,
  sizes?: Sizes,
): LayoutPlan {
  return scope.kind === 'place' ? place(canvas, scope, sizes) : replan(canvas, sizes)
}
