import { getEntityMeta } from '../ontology'
import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { isObject } from './document'
import { endpointResourceName } from './managedRelations'
import type { JsonObject } from './types'

export interface RenameApiResourceResult {
  nodes: CanvasNode[]
  changed: number
}

function field(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

export function renameApiResource(
  canvas: JsonCanvas,
  resourceId: string,
  nextResourceName: string,
): RenameApiResourceResult {
  const nodes = (canvas.nodes ?? []).map((node) => structuredClone(node))
  const resource = nodes.find((node) => (
    node.id === resourceId && getEntityMeta(node)?.entityType === 'resource'
  ))
  if (!resource) return { nodes, changed: 0 }
  const previousName = field(resource, 'name')
  const nextName = nextResourceName.trim()
  if (!nextName || previousName === nextName) return { nodes, changed: 0 }

  resource.app = {
    ...(resource.app ?? {}),
    fields: { ...(getEntityMeta(resource)?.fields ?? {}), name: nextName },
  }
  const app = resource.app as Record<string, unknown>
  delete app.inferred
  delete app.inferredName
  let changed = 1

  for (const node of nodes) {
    if (getEntityMeta(node)?.entityType !== 'endpoint') continue
    if (endpointResourceName(node) !== previousName) continue
    let operation: JsonObject
    try {
      const parsed: unknown = JSON.parse(field(node, 'operation') || '{}')
      if (!isObject(parsed)) continue
      operation = parsed
    } catch {
      continue
    }
    const tags = Array.isArray(operation.tags)
      ? operation.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
    if (tags[0] === previousName) tags[0] = nextName
    else if (tags.length === 0) tags.push(nextName)
    else continue
    operation.tags = tags
    node.app = {
      ...(node.app ?? {}),
      fields: {
        ...(getEntityMeta(node)?.fields ?? {}),
        operation: JSON.stringify(operation, null, 2),
      },
    }
    changed += 1
  }
  return { nodes, changed }
}
