import { jsonCanvasSchema, type JsonCanvas } from './jsonCanvas'

export type CanvasValidationResult =
  | { ok: true; canvas: JsonCanvas }
  | { ok: false; errors: string[] }

export const MAX_CANVAS_BYTES = 2 * 1024 * 1024

export function validateCanvas(value: unknown): CanvasValidationResult {
  const parsed = jsonCanvasSchema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'canvas'
        return `${path}: ${issue.message}`
      }),
    }
  }

  const canvas = parsed.data as JsonCanvas
  const nodes = canvas.nodes ?? []
  const edges = canvas.edges ?? []
  const errors: string[] = []
  const ids = new Set<string>()

  for (const node of nodes) {
    if (ids.has(node.id)) errors.push(`nodes: duplicate id "${node.id}"`)
    ids.add(node.id)
  }

  for (const edge of edges) {
    if (ids.has(edge.id)) errors.push(`edges: duplicate id "${edge.id}"`)
    ids.add(edge.id)
  }

  const nodeIds = new Set(nodes.map((node) => node.id))
  for (const edge of edges) {
    if (!nodeIds.has(edge.fromNode)) {
      errors.push(`edges.${edge.id}: fromNode "${edge.fromNode}" does not exist`)
    }
    if (!nodeIds.has(edge.toNode)) {
      errors.push(`edges.${edge.id}: toNode "${edge.toNode}" does not exist`)
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, canvas }
}

export function canvasByteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}
