import type { CanvasEdge, CanvasNode, JsonCanvas } from './jsonCanvas'

export type MergeEntityKind = 'node' | 'edge'

export interface MergeConflict {
  kind: MergeEntityKind
  id: string
  reason: 'both-changed' | 'both-added' | 'delete-vs-edit'
  local?: CanvasNode | CanvasEdge
  remote?: CanvasNode | CanvasEdge
}

export interface MergeResult {
  canvas: JsonCanvas
  conflicts: MergeConflict[]
}

type Identified = { id: string }

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function indexById<T extends Identified>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== typeof right) return false
  if (left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    return left.every((item, index) => deepEqual(item, right[index]))
  }
  if (typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const leftKeys = Object.keys(leftRecord)
    const rightKeys = Object.keys(rightRecord)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(rightRecord, key)
        && deepEqual(leftRecord[key], rightRecord[key]),
    )
  }
  return false
}

function mergeFields<T extends Identified>(
  kind: MergeEntityKind,
  base: T,
  local: T,
  remote: T,
  conflicts: MergeConflict[],
): T {
  const result: Record<string, unknown> = { ...remote }
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])
  let conflict = false

  for (const key of keys) {
    if (key === 'id') continue
    const baseValue = (base as Record<string, unknown>)[key]
    const localValue = (local as Record<string, unknown>)[key]
    const remoteValue = (remote as Record<string, unknown>)[key]
    const localChanged = !deepEqual(localValue, baseValue)
    const remoteChanged = !deepEqual(remoteValue, baseValue)

    if (!localChanged) continue
    if (!remoteChanged) {
      result[key] = localValue
      continue
    }
    if (deepEqual(localValue, remoteValue)) continue
    conflict = true
  }

  if (conflict) {
    conflicts.push({
      kind,
      id: base.id,
      reason: 'both-changed',
      local: local as CanvasNode | CanvasEdge,
      remote: remote as CanvasNode | CanvasEdge,
    })
  }

  return result as T
}

function mergeEntities<T extends Identified>(
  kind: MergeEntityKind,
  baseItems: T[],
  localItems: T[],
  remoteItems: T[],
  conflicts: MergeConflict[],
): T[] {
  const base = indexById(baseItems)
  const local = indexById(localItems)
  const remote = indexById(remoteItems)
  const result: T[] = []
  const resultIds = new Set<string>()

  const add = (item: T) => {
    if (resultIds.has(item.id)) return
    result.push(item)
    resultIds.add(item.id)
  }

  for (const remoteItem of remoteItems) {
    const id = remoteItem.id
    const baseItem = base.get(id)
    const localItem = local.get(id)

    if (!baseItem) {
      if (localItem) {
        if (deepEqual(localItem, remoteItem)) {
          add(remoteItem)
        } else {
          conflicts.push({
            kind,
            id,
            reason: 'both-added',
            local: localItem as CanvasNode | CanvasEdge,
            remote: remoteItem as CanvasNode | CanvasEdge,
          })
          add(remoteItem)
        }
      } else {
        add(remoteItem)
      }
      continue
    }

    if (!localItem) {
      if (deepEqual(baseItem, remoteItem)) continue
      conflicts.push({
        kind,
        id,
        reason: 'delete-vs-edit',
        remote: remoteItem as CanvasNode | CanvasEdge,
      })
      add(remoteItem)
      continue
    }

    if (deepEqual(localItem, baseItem)) {
      add(remoteItem)
      continue
    }
    if (deepEqual(remoteItem, baseItem)) {
      add(localItem)
      continue
    }
    if (deepEqual(localItem, remoteItem)) {
      add(remoteItem)
      continue
    }
    add(mergeFields(kind, baseItem, localItem, remoteItem, conflicts))
  }

  for (const localItem of localItems) {
    const id = localItem.id
    if (remote.has(id)) continue
    const baseItem = base.get(id)
    if (baseItem) {
      if (deepEqual(localItem, baseItem)) continue
      conflicts.push({
        kind,
        id,
        reason: 'delete-vs-edit',
        local: localItem as CanvasNode | CanvasEdge,
      })
    }
    add(localItem)
  }

  return result
}

function pruneDanglingEdges(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  return edges.filter((edge) => nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode))
}

function mergeTopLevel(
  base: JsonCanvas,
  local: JsonCanvas,
  remote: JsonCanvas,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...remote }
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])
  for (const key of keys) {
    if (key === 'nodes' || key === 'edges') continue
    const baseValue = base[key]
    const localValue = local[key]
    const remoteValue = remote[key]
    const localChanged = !deepEqual(localValue, baseValue)
    const remoteChanged = !deepEqual(remoteValue, baseValue)
    if (localChanged && !remoteChanged) result[key] = localValue
    else if (!localChanged && remoteChanged) result[key] = remoteValue
  }
  return result
}

export function mergeCanvas(
  base: JsonCanvas,
  local: JsonCanvas,
  remote: JsonCanvas,
): MergeResult {
  const conflicts: MergeConflict[] = []
  const baseNodes = asArray(base.nodes)
  const localNodes = asArray(local.nodes)
  const remoteNodes = asArray(remote.nodes)
  const baseEdges = asArray(base.edges)
  const localEdges = asArray(local.edges)
  const remoteEdges = asArray(remote.edges)

  const nodes = mergeEntities('node', baseNodes, localNodes, remoteNodes, conflicts)
  const mergedEdges = mergeEntities('edge', baseEdges, localEdges, remoteEdges, conflicts)
  const edges = pruneDanglingEdges(nodes, mergedEdges)

  return {
    canvas: {
      ...mergeTopLevel(base, local, remote),
      nodes,
      edges,
    } as JsonCanvas,
    conflicts,
  }
}
