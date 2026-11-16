import { getEdgeMeta, getEntityMeta } from '../ontology'
import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { buildApiReferenceDocument } from './reference'

export interface ApiCardSize {
  width: number
  height: number
}

export type ApiSizeMap = Record<string, ApiCardSize>

const COLUMN_GAP = 80
const LANE_GAP = 40
const ENDPOINT_GAP = 24
const LANE_PADDING = 24
const LANE_HEADER = 52
const MODEL_GAP = 40
const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']

function field(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

function nodeSize(node: CanvasNode, sizes: ApiSizeMap): ApiCardSize {
  return sizes[node.id] ?? { width: node.width, height: node.height }
}

function resourceOrder(a: CanvasNode, b: CanvasNode): number {
  const aInferred = getEntityMeta(a)?.inferred === true
  const bInferred = getEntityMeta(b)?.inferred === true
  if (aInferred !== bInferred) return aInferred ? 1 : -1
  const aOrder = Number(getEntityMeta(a)?.tagOrder ?? Number.NaN)
  const bOrder = Number(getEntityMeta(b)?.tagOrder ?? Number.NaN)
  if (Number.isFinite(aOrder) || Number.isFinite(bOrder)) {
    return (Number.isFinite(aOrder) ? aOrder : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(bOrder) ? bOrder : Number.MAX_SAFE_INTEGER)
  }
  return field(a, 'name').localeCompare(field(b, 'name'))
}

function endpointOrder(a: { path: string; method: string }, b: { path: string; method: string }): number {
  const aSegments = a.path.split('/').filter(Boolean)
  const bSegments = b.path.split('/').filter(Boolean)
  const length = Math.min(aSegments.length, bSegments.length)
  for (let index = 0; index < length; index += 1) {
    const aSegment = aSegments[index] ?? ''
    const bSegment = bSegments[index] ?? ''
    const aParam = aSegment.startsWith('{')
    const bParam = bSegment.startsWith('{')
    if (aParam !== bParam) return aParam ? 1 : -1
    if (aSegment !== bSegment) return aSegment.localeCompare(bSegment)
  }
  if (aSegments.length !== bSegments.length) return aSegments.length - bSegments.length
  return METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)
}


function placeColumn(
  items: CanvasNode[],
  x: number,
  y: number,
  sizes: ApiSizeMap,
  positions: Map<string, { x: number; y: number }>,
  gap: number,
): number {
  let cursor = y
  for (const item of items) {
    const size = nodeSize(item, sizes)
    positions.set(item.id, { x, y: cursor })
    cursor += size.height + gap
  }
  return cursor
}

export function estimateApiSizes(canvas: JsonCanvas): ApiSizeMap {
  const reference = buildApiReferenceDocument(canvas.nodes ?? [])
  const sizes: ApiSizeMap = {}
  for (const node of canvas.nodes ?? []) {
    const entityType = getEntityMeta(node)?.entityType
    if (entityType === 'endpoint') {
      const endpoint = reference.resources.flatMap((resource) => resource.endpoints).find((candidate) => candidate.id === node.id)
      const chips = (endpoint?.parameters.length ?? 0) + (endpoint?.requestModels.length ?? 0) + (endpoint?.responses.length ?? 0)
      sizes[node.id] = { width: 360, height: 96 + Math.ceil(chips / 3) * 22 }
    } else if (entityType === 'schema') {
      sizes[node.id] = { width: 360, height: 300 }
    } else if (entityType === 'api_definition') {
      sizes[node.id] = { width: 420, height: 220 }
    } else if (entityType === 'security_scheme') {
      sizes[node.id] = { width: 360, height: 200 }
    } else {
      sizes[node.id] = { width: node.width, height: node.height }
    }
  }
  return sizes
}

export function layoutApiCanvas(canvas: JsonCanvas, sizes: ApiSizeMap = {}): JsonCanvas {
  const nodes = canvas.nodes ?? []
  const reference = buildApiReferenceDocument(nodes)
  const api = nodes.find((node) => getEntityMeta(node)?.entityType === 'api_definition')
  const security = nodes.filter((node) => getEntityMeta(node)?.entityType === 'security_scheme')
  const resources = nodes
    .filter((node) => getEntityMeta(node)?.entityType === 'resource')
    .sort(resourceOrder)
  const schemas = nodes.filter((node) => getEntityMeta(node)?.entityType === 'schema')
  const endpoints = nodes.filter((node) => getEntityMeta(node)?.entityType === 'endpoint')
  const positions = new Map<string, { x: number; y: number }>()
  const placed = new Set<string>()
  const apiSize = api ? nodeSize(api, sizes) : { width: 420, height: 220 }
  const securitySize = security.reduce((max, node) => Math.max(max, nodeSize(node, sizes).height), 0)
  const headerHeight = Math.max(apiSize.height, securitySize)

  if (api) {
    positions.set(api.id, { x: 0, y: 0 })
    placed.add(api.id)
  }
  let securityX = apiSize.width + COLUMN_GAP
  for (const scheme of security) {
    positions.set(scheme.id, { x: securityX, y: 0 })
    placed.add(scheme.id)
    securityX += nodeSize(scheme, sizes).width + COLUMN_GAP
  }

  const requestNames = new Set(reference.resources.flatMap((resource) => resource.endpoints.flatMap((endpoint) => endpoint.requestModels)))
  const successNames = new Set(reference.resources.flatMap((resource) => resource.endpoints.flatMap((endpoint) => (
    endpoint.responses.filter((response) => /^[123]/.test(response.status)).flatMap((response) => response.model?.split(', ') ?? [])
  ))))
  const errorNames = new Set(reference.resources.flatMap((resource) => resource.endpoints.flatMap((endpoint) => (
    endpoint.responses.filter((response) => /^[45]/.test(response.status)).flatMap((response) => response.model?.split(', ') ?? [])
  ))))
  const responseNames = new Set([...successNames, ...[...requestNames].filter((name) => successNames.has(name))])
  const sharedNames = new Set([...errorNames].filter((name) => !requestNames.has(name) && !successNames.has(name)))
  const schemaByName = new Map(schemas.map((node) => [field(node, 'name'), node]))
  const requestSchemas = [...requestNames].filter((name) => !responseNames.has(name) && !sharedNames.has(name)).map((name) => schemaByName.get(name)).filter((node): node is CanvasNode => Boolean(node))
  const responseSchemas = [...responseNames].map((name) => schemaByName.get(name)).filter((node): node is CanvasNode => Boolean(node))
  const sharedSchemas = [...sharedNames].map((name) => schemaByName.get(name)).filter((node): node is CanvasNode => Boolean(node))
  const used = new Set([...requestNames, ...successNames, ...errorNames])
  const unusedSchemas = schemas.filter((node) => !used.has(field(node, 'name'))).sort((a, b) => field(a, 'name').localeCompare(field(b, 'name')))

  const requestWidth = requestSchemas.reduce((max, node) => Math.max(max, nodeSize(node, sizes).width), 0)
  const laneX = requestWidth > 0 ? requestWidth + COLUMN_GAP : 0
  const laneWidth = endpoints.reduce((max, node) => Math.max(max, nodeSize(node, sizes).width), 0) + LANE_PADDING * 2
  let laneY = headerHeight + COLUMN_GAP
  const endpointPositions = new Map<string, { x: number; y: number }>()
  let maxLaneBottom = laneY

  for (const resource of resources) {
    const laneEndpoints = reference.resources.find((candidate) => candidate.id === resource.id)?.endpoints
      .map((endpoint) => endpoints.find((node) => node.id === endpoint.id))
      .filter((node): node is CanvasNode => Boolean(node))
      .sort((a, b) => endpointOrder(
        { path: field(a, 'path'), method: field(a, 'method') },
        { path: field(b, 'path'), method: field(b, 'method') },
      )) ?? []
    let y = laneY + LANE_HEADER + LANE_PADDING
    let laneBottom = y
    for (const endpoint of laneEndpoints) {
      const size = nodeSize(endpoint, sizes)
      positions.set(endpoint.id, { x: laneX + LANE_PADDING, y })
      endpointPositions.set(endpoint.id, { x: laneX + LANE_PADDING, y })
      placed.add(endpoint.id)
      y += size.height + ENDPOINT_GAP
      laneBottom = y - ENDPOINT_GAP + LANE_PADDING
    }
    const laneHeight = Math.max(LANE_HEADER + LANE_PADDING * 2, laneBottom - laneY)
    positions.set(resource.id, { x: laneX, y: laneY })
    placed.add(resource.id)
    sizes[resource.id] = { width: laneWidth, height: laneHeight }
    laneY += laneHeight + LANE_GAP
    maxLaneBottom = laneY - LANE_GAP
  }

  const responseWidth = responseSchemas.reduce((max, node) => Math.max(max, nodeSize(node, sizes).width), 0)
  const responseX = laneX + laneWidth + COLUMN_GAP
  const schemaFirstY = new Map<string, number>()
  for (const resource of reference.resources) {
    for (const endpoint of resource.endpoints) {
      const y = endpointPositions.get(endpoint.id)?.y
      if (y == null) continue
      for (const name of [...endpoint.requestModels, ...endpoint.responses.flatMap((response) => response.model?.split(', ') ?? [])]) {
        if (!schemaFirstY.has(name)) schemaFirstY.set(name, y)
      }
    }
  }
  const orderByFirstUse = (a: CanvasNode, b: CanvasNode) => (
    (schemaFirstY.get(field(a, 'name')) ?? Number.MAX_SAFE_INTEGER)
    - (schemaFirstY.get(field(b, 'name')) ?? Number.MAX_SAFE_INTEGER)
    || field(a, 'name').localeCompare(field(b, 'name'))
  )
  requestSchemas.sort(orderByFirstUse)
  responseSchemas.sort(orderByFirstUse)
  const requestY = requestSchemas.length > 0 ? Math.max(laneY - LANE_GAP - headerHeight, headerHeight + COLUMN_GAP) : headerHeight + COLUMN_GAP
  placeColumn(requestSchemas, 0, requestY, sizes, positions, MODEL_GAP)
  const responseEnd = placeColumn(responseSchemas, responseX, headerHeight + COLUMN_GAP, sizes, positions, MODEL_GAP)
  for (const node of [...requestSchemas, ...responseSchemas]) placed.add(node.id)

  const usesEdges = (canvas.edges ?? []).filter((edge) => getEdgeMeta(edge)?.relationType === 'uses')
  const depthByName = new Map<string, number>()
  for (const node of responseSchemas) depthByName.set(field(node, 'name'), 0)
  for (let pass = 0; pass < schemas.length; pass += 1) {
    let changed = false
    for (const edge of usesEdges) {
      const from = nodes.find((node) => node.id === edge.fromNode)
      const to = nodes.find((node) => node.id === edge.toNode)
      if (!from || !to) continue
      const fromName = field(from, 'name')
      const toName = field(to, 'name')
      const depth = depthByName.get(fromName)
      if (depth == null) continue
      if (!depthByName.has(toName)) {
        depthByName.set(toName, depth + 1)
        changed = true
      } else if ((depthByName.get(toName) ?? 0) < depth + 1) {
        depthByName.set(toName, depth + 1)
        changed = true
      }
    }
    if (!changed) break
  }
  const extraByDepth = new Map<number, CanvasNode[]>()
  for (const node of schemas) {
    if (placed.has(node.id)) continue
    const depth = depthByName.get(field(node, 'name'))
    if (depth == null || depth === 0) continue
    const list = extraByDepth.get(depth) ?? []
    list.push(node)
    extraByDepth.set(depth, list)
  }
  let previousColumnEnd = responseEnd
  let previousColumnX = responseX
  for (const depth of [...extraByDepth.keys()].sort((a, b) => a - b)) {
    const column = extraByDepth.get(depth) ?? []
    column.sort(orderByFirstUse)
    const x = previousColumnX + responseWidth + COLUMN_GAP
    const end = placeColumn(column, x, headerHeight + COLUMN_GAP, sizes, positions, MODEL_GAP)
    for (const node of column) placed.add(node.id)
    previousColumnX = x
    previousColumnEnd = Math.max(previousColumnEnd, end)
  }

  const sharedEnd = placeColumn(sharedSchemas, laneX, Math.max(maxLaneBottom, previousColumnEnd) + COLUMN_GAP, sizes, positions, MODEL_GAP)
  for (const node of sharedSchemas) placed.add(node.id)
  placeColumn(unusedSchemas, 0, Math.max(sharedEnd, maxLaneBottom) + COLUMN_GAP, sizes, positions, MODEL_GAP)
  for (const node of unusedSchemas) placed.add(node.id)

  const nextNodes = nodes.map((node) => {
    const position = positions.get(node.id)
    const size = sizes[node.id]
    if (!position) return node
    return {
      ...node,
      x: Math.round(position.x),
      y: Math.round(position.y),
      ...(size ? { width: Math.round(size.width), height: Math.round(size.height) } : {}),
    }
  })
  return { ...canvas, nodes: nextNodes }
}
