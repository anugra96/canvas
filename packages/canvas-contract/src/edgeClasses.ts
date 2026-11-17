import type { CanvasEdge, CanvasNode } from './jsonCanvas'
import {
  DEFAULT_ONTOLOGY,
  findRelationType,
  getEdgeMeta,
  getEntityMeta,
  type Ontology,
  type RelationCategory,
} from './ontology'

export const EDGE_CLASSES = [
  'flow',
  'contract',
  'structure',
  'access',
  'annotation',
  'unspecified',
] as const

export type EdgeClass = (typeof EDGE_CLASSES)[number]

export type EdgeOrigin = 'explicit' | 'managed' | 'inferred'

function borderType(node: CanvasNode | undefined): string | undefined {
  return node ? getEntityMeta(node)?.entityType : undefined
}

export function edgeClass(
  edge: CanvasEdge,
  source?: CanvasNode,
  target?: CanvasNode,
  ontology: Ontology = DEFAULT_ONTOLOGY,
): EdgeClass {
  const relationType = getEdgeMeta(edge)?.relationType
  if (!relationType) return 'unspecified'
  if (
    relationType === 'uses'
    && (borderType(source) === 'schema' || borderType(target) === 'schema')
  ) {
    return 'contract'
  }
  const category: RelationCategory | undefined = findRelationType(ontology, relationType)?.category
  return category ?? 'unspecified'
}

export function edgeOrigin(edge: CanvasEdge): EdgeOrigin {
  if (getEdgeMeta(edge)?.inferred === true || edge.id.startsWith('schema-ref:')) {
    return 'inferred'
  }
  if (getEdgeMeta(edge)?.managed === true) return 'managed'
  return 'explicit'
}
