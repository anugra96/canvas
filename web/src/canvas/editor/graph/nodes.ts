import { createNodeId, emptyEntityFields, findEntityType, renderEntityMarkdown } from '@canvas/contract'
import type { CanvasNode, Ontology, TextNode } from '@canvas/contract'

export function makeTextNode(
  position: { x: number; y: number },
  width = 360,
  height = 200,
): TextNode {
  return {
    id: createNodeId(),
    type: 'text',
    x: Math.round(position.x),
    y: Math.round(position.y),
    width,
    height,
    text: '',
  }
}

export function makeEntityNode(
  entityTypeId: string,
  position: { x: number; y: number },
  ontology: Ontology,
): CanvasNode | null {
  const entityType = findEntityType(ontology, entityTypeId)
  if (!entityType) return null
  const fields = emptyEntityFields(entityType)
  return {
    id: createNodeId(),
    type: 'text',
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: entityType.defaultSize.width,
    height: entityType.defaultSize.height,
    text: renderEntityMarkdown(entityType, fields),
    app: { entityType: entityType.id, fields },
  } as CanvasNode
}
