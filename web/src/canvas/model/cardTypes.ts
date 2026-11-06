import {
  emptyEntityFields,
  findEntityType,
  renderEntityMarkdown,
  type CanvasNode,
  type Ontology,
} from '@skyward/canvas-contract'

import type { CanvasFlowNode } from './adapter'

function fallbackText(node: CanvasFlowNode): string {
  const raw = node.data.raw
  if (raw.type === 'file') {
    return raw.subpath ? `**${raw.file}**\n\n${raw.subpath}` : `**${raw.file}**`
  }
  if (raw.type === 'link') return raw.url
  return node.data.text ?? (raw.type === 'text' ? raw.text : '')
}

export function convertNodeType(
  node: CanvasFlowNode,
  typeId: string,
  ontology: Ontology,
): CanvasFlowNode {
  const raw = { ...node.data.raw } as Record<string, unknown>

  if (typeId === 'text') {
    const text = fallbackText(node)
    raw.type = 'text'
    raw.text = text
    delete raw.skyward
    delete raw.file
    delete raw.subpath
    delete raw.ratio
    delete raw.url
    return {
      ...node,
      type: 'text',
      data: {
        ...node.data,
        raw: raw as CanvasNode,
        text,
        entity: undefined,
        file: undefined,
        url: undefined,
      },
    }
  }

  const entityType = findEntityType(ontology, typeId)
  if (!entityType) return node

  const currentFields = node.data.entity?.fields ?? {}
  const fields = { ...emptyEntityFields(entityType), ...currentFields }

  if (!node.data.entity) {
    const oldText = fallbackText(node)
    if (oldText) {
      const textField = entityType.fields.find((field) => field.type === 'textarea')
      if (textField) fields[textField.key] = oldText
    }
    if (raw.type === 'file' && typeof raw.file === 'string') {
      const nameField = entityType.fields.find((field) => field.key === 'name')
      if (nameField) fields.name = raw.file
    }
    if (raw.type === 'link' && typeof raw.url === 'string') {
      const urlField = entityType.fields.find((field) => field.key === 'url')
      if (urlField) fields.url = raw.url
    }
  }

  const text = renderEntityMarkdown(entityType, fields)
  const entity = { entityType: entityType.id, fields }
  raw.type = 'text'
  raw.text = text
  raw.skyward = { ...(node.data.raw.skyward ?? {}), ...entity }
  delete raw.file
  delete raw.subpath
  delete raw.ratio
  delete raw.url

  return {
    ...node,
    type: entityType.id === 'code' ? 'code' : 'entity',
    data: {
      ...node.data,
      raw: raw as CanvasNode,
      text,
      entity,
      file: undefined,
      url: undefined,
    },
  }
}
