import { createNodeId, type CanvasNode, type JsonCanvas } from '../jsonCanvas'
import {
  DEFAULT_ONTOLOGY,
  findEntityType,
  getEntityMeta,
  getGroupMembers,
  type EntityFields,
} from '../ontology'
import { layoutApiCanvas, type ApiSizeMap } from './layout'
import { endpointResourceName } from './managedRelations'
import type { JsonObject } from './types'

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

export interface AddApiEndpointInput {
  resourceId: string
  method: string
  path: string
  summary: string
}

export interface AddApiEndpointResult {
  nodes: CanvasNode[]
  endpointId: string
  errors: string[]
}

function makeNode(
  entityType: string,
  x: number,
  y: number,
  fields: EntityFields,
): CanvasNode {
  const definition = findEntityType(DEFAULT_ONTOLOGY, entityType)
  return {
    id: createNodeId(),
    type: 'text',
    x: Math.round(x),
    y: Math.round(y),
    width: definition?.defaultSize.width ?? 360,
    height: definition?.defaultSize.height ?? 220,
    text: '',
    app: { entityType, fields },
  }
}

function field(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

export function addApiEndpoint(
  canvas: JsonCanvas,
  input: AddApiEndpointInput,
  sizes: ApiSizeMap = {},
): AddApiEndpointResult {
  const nodes = canvas.nodes ?? []
  const resource = nodes.find((node) => (
    getEntityMeta(node)?.entityType === 'resource' && node.id === input.resourceId
  ))
  const method = input.method.trim().toUpperCase()
  const path = input.path.trim()
  const summary = input.summary.trim()
  const errors: string[] = []
  if (!resource) errors.push('Choose a resource.')
  if (!METHODS.has(method)) errors.push('Method must be GET, POST, PUT, PATCH, or DELETE.')
  if (!path) errors.push('Path is required.')
  const resourceName = resource ? field(resource, 'name') : ''
  if (!resourceName) errors.push('The resource needs a name.')
  if (nodes.some((node) => (
    getEntityMeta(node)?.entityType === 'endpoint'
    && field(node, 'method').toUpperCase() === method
    && field(node, 'path') === path
  ))) {
    errors.push(`${method} ${path} already exists.`)
  }
  if (errors.length > 0 || !resource) return { nodes: [], endpointId: '', errors }

  const operation: JsonObject = {
    ...(summary ? { summary } : {}),
    tags: [resourceName],
  }
  const endpoint = makeNode('endpoint', resource.x, resource.y, {
    method,
    path,
    status: 'active',
    operation: JSON.stringify(operation, null, 2),
  })
  const existingMembers = getGroupMembers(resource) ?? nodes
    .filter((node) => getEntityMeta(node)?.entityType === 'endpoint' && endpointResourceName(node) === resourceName)
    .map((node) => node.id)
  const nextResource: CanvasNode = {
    ...resource,
    app: {
      ...(resource.app ?? {}),
      groupMembers: [...new Set([...existingMembers, endpoint.id])],
    },
  }
  const nextNodes = nodes.map((node) => (node.id === resource.id ? nextResource : node))
  const laidOut = layoutApiCanvas({ ...canvas, nodes: [...nextNodes, endpoint] }, sizes)
  return {
    nodes: laidOut.nodes ?? [],
    endpointId: endpoint.id,
    errors: [],
  }
}
