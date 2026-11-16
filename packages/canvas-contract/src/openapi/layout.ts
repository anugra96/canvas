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



export function orderedApiEndpoints(nodes: CanvasNode[]): CanvasNode[] {
  const reference = buildApiReferenceDocument(nodes)
  const resources = nodes
    .filter((node) => getEntityMeta(node)?.entityType === 'resource')
    .sort(resourceOrder)
  const endpoints = nodes.filter((node) => getEntityMeta(node)?.entityType === 'endpoint')
  const ordered: CanvasNode[] = []
  for (const resource of resources) {
    const lane = reference.resources.find((candidate) => candidate.id === resource.id)
    for (const endpoint of [...(lane?.endpoints ?? [])].sort((a, b) => endpointOrder(a, b))) {
      const node = endpoints.find((candidate) => candidate.id === endpoint.id)
      if (node && !ordered.includes(node)) ordered.push(node)
    }
  }
  for (const endpoint of endpoints.filter((node) => !ordered.includes(node)).sort((a, b) => endpointOrder(
    { path: field(a, 'path'), method: field(a, 'method') },
    { path: field(b, 'path'), method: field(b, 'method') },
  ))) {
    ordered.push(endpoint)
  }
  return ordered
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
  const resolvedSizes: ApiSizeMap = { ...sizes }
  const reference = buildApiReferenceDocument(nodes)
  const api = nodes.find((node) => getEntityMeta(node)?.entityType === 'api_definition')
  const security = nodes.filter((node) => getEntityMeta(node)?.entityType === 'security_scheme')
  const resources = nodes
    .filter((node) => getEntityMeta(node)?.entityType === 'resource')
    .sort(resourceOrder)
  const schemas = nodes.filter((node) => getEntityMeta(node)?.entityType === 'schema')
  const endpoints = nodes.filter((node) => getEntityMeta(node)?.entityType === 'endpoint')
  const schemaByName = new Map(schemas.map((node) => [field(node, 'name'), node]))
  const nameById = new Map(schemas.map((node) => [node.id, field(node, 'name')]))
  const positions = new Map<string, { x: number; y: number }>()
  const modelY = new Map<string, number>()
  const apiSize = api ? nodeSize(api, resolvedSizes) : { width: 420, height: 220 }
  const securityHeight = security.reduce((max, node) => Math.max(max, nodeSize(node, resolvedSizes).height), 0)
  const headerHeight = Math.max(apiSize.height, securityHeight)
  const top = headerHeight + COLUMN_GAP

  if (api) positions.set(api.id, { x: 0, y: 0 })
  let securityX = apiSize.width + COLUMN_GAP
  for (const scheme of security) {
    positions.set(scheme.id, { x: securityX, y: 0 })
    securityX += nodeSize(scheme, resolvedSizes).width + COLUMN_GAP
  }

  const accepts = (canvas.edges ?? []).filter((edge) => getEdgeMeta(edge)?.relationType === 'accepts')
  const returns = (canvas.edges ?? []).filter((edge) => getEdgeMeta(edge)?.relationType === 'returns')
  const uses = (canvas.edges ?? []).filter((edge) => getEdgeMeta(edge)?.relationType === 'uses')
  const requestSeeds = new Set(accepts.flatMap((edge) => {
    const name = nameById.get(edge.toNode)
    return name ? [name] : []
  }))
  const successSeeds = new Set(returns.flatMap((edge) => {
    const status = getEdgeMeta(edge)?.status ?? edge.label ?? ''
    const name = nameById.get(edge.toNode)
    return /^[123]/.test(status) && name ? [name] : []
  }))
  const errorSeeds = new Set(returns.flatMap((edge) => {
    const status = getEdgeMeta(edge)?.status ?? edge.label ?? ''
    const name = nameById.get(edge.toNode)
    return /^[45]/.test(status) && name ? [name] : []
  }))
  const usesTargets = new Map<string, string[]>()
  for (const edge of uses) {
    const from = nameById.get(edge.fromNode)
    const to = nameById.get(edge.toNode)
    if (!from || !to) continue
    const list = usesTargets.get(from) ?? []
    list.push(to)
    usesTargets.set(from, list)
  }

  function reachable(seeds: Iterable<string>, blocked = new Set<string>()): Map<string, number> {
    const result = new Map<string, number>()
    const queue = [...seeds].filter((name) => !blocked.has(name)).map((name) => ({ name, depth: 0 }))
    while (queue.length > 0) {
      const next = queue.shift()
      if (!next || result.has(next.name) || blocked.has(next.name)) continue
      result.set(next.name, next.depth)
      for (const target of usesTargets.get(next.name) ?? []) {
        if (!result.has(target) && !blocked.has(target)) queue.push({ name: target, depth: next.depth + 1 })
      }
    }
    return result
  }

  const responseReach = reachable(successSeeds)
  const requestReach = reachable([...requestSeeds].filter((name) => !responseReach.has(name)), new Set(responseReach.keys()))
  const sharedBlocked = new Set([...requestReach.keys(), ...responseReach.keys()])
  const sharedSeeds = [...errorSeeds].filter((name) => !sharedBlocked.has(name))
  const sharedReach = reachable(sharedSeeds, sharedBlocked)

  const endpointPositions = new Map<string, { x: number; y: number }>()
  const endpointByName = new Map<string, number>()
  const requestColumnCount = requestReach.size > 0 ? Math.max(...requestReach.values()) + 1 : 0
  const requestWidths = Array.from({ length: requestColumnCount }, (_, depth) => (
    schemas.filter((node) => requestReach.get(field(node, 'name')) === depth)
      .reduce((max, node) => Math.max(max, nodeSize(node, resolvedSizes).width), 0)
  ))
  const requestTotalWidth = requestWidths.reduce((sum, width) => sum + width, 0)
    + Math.max(0, requestWidths.length - 1) * COLUMN_GAP
  const laneX = requestTotalWidth > 0 ? requestTotalWidth + COLUMN_GAP : 0
  const laneWidth = endpoints.reduce((max, node) => Math.max(max, nodeSize(node, resolvedSizes).width), 0) + LANE_PADDING * 2
  let laneY = top
  let lanesBottom = laneY
  const orderedEndpoints = new Map<string, CanvasNode[]>()

  for (const resource of resources) {
    const laneEndpoints = reference.resources.find((candidate) => candidate.id === resource.id)?.endpoints
      .map((endpoint) => endpoints.find((node) => node.id === endpoint.id))
      .filter((node): node is CanvasNode => Boolean(node))
      .sort((a, b) => endpointOrder(
        { path: field(a, 'path'), method: field(a, 'method') },
        { path: field(b, 'path'), method: field(b, 'method') },
      )) ?? []
    orderedEndpoints.set(resource.id, laneEndpoints)
    let y = laneY + LANE_HEADER + LANE_PADDING
    let laneBottom = y
    for (const endpoint of laneEndpoints) {
      const size = nodeSize(endpoint, resolvedSizes)
      positions.set(endpoint.id, { x: laneX + LANE_PADDING, y })
      endpointPositions.set(endpoint.id, { x: laneX + LANE_PADDING, y })
      const endpointRef = reference.resources.flatMap((item) => item.endpoints).find((item) => item.id === endpoint.id)
      for (const name of endpointRef?.requestModels ?? []) {
        endpointByName.set(name, Math.min(endpointByName.get(name) ?? Number.MAX_SAFE_INTEGER, y))
      }
      for (const response of endpointRef?.responses ?? []) {
        for (const name of response.model?.split(', ') ?? []) {
          endpointByName.set(name, Math.min(endpointByName.get(name) ?? Number.MAX_SAFE_INTEGER, y))
        }
      }
      y += size.height + ENDPOINT_GAP
      laneBottom = y - ENDPOINT_GAP + LANE_PADDING
    }
    const laneHeight = Math.max(LANE_HEADER + LANE_PADDING * 2, laneBottom - laneY)
    positions.set(resource.id, { x: laneX, y: laneY })
    resolvedSizes[resource.id] = { width: laneWidth, height: laneHeight }
    laneY += laneHeight + LANE_GAP
    lanesBottom = laneY - LANE_GAP
  }

  const requestX: number[] = []
  let requestCursor = 0
  for (let depth = requestColumnCount - 1; depth >= 0; depth -= 1) {
    requestX[depth] = requestCursor
    requestCursor += (requestWidths[depth] ?? 0) + COLUMN_GAP
  }

  function placeTargetColumn(
    depth: number,
    items: CanvasNode[],
    x: number,
    targetFor: (name: string) => number | undefined,
    previous: Map<string, number>,
  ): number {
    const ordered = items
      .map((node) => ({ node, target: targetFor(field(node, 'name')) }))
      .sort((a, b) => (a.target ?? Number.MAX_SAFE_INTEGER) - (b.target ?? Number.MAX_SAFE_INTEGER)
        || field(a.node, 'name').localeCompare(field(b.node, 'name')))
    let previousBottom = top - MODEL_GAP
    for (const item of ordered) {
      const size = nodeSize(item.node, resolvedSizes)
      const y = Math.max(item.target ?? top, previousBottom + MODEL_GAP)
      positions.set(item.node.id, { x, y })
      modelY.set(field(item.node, 'name'), y)
      previous.set(field(item.node, 'name'), y)
      previousBottom = y + size.height
    }
    return previousBottom
  }

  let requestBottom = top - MODEL_GAP
  let responseBottom = top - MODEL_GAP
  const requestNamesByDepth = new Map<number, CanvasNode[]>()
  for (const node of schemas) {
    const depth = requestReach.get(field(node, 'name'))
    if (depth == null) continue
    const list = requestNamesByDepth.get(depth) ?? []
    list.push(node)
    requestNamesByDepth.set(depth, list)
  }
  const requestPlaced = new Map<string, number>()
  for (let depth = 0; depth < requestColumnCount; depth += 1) {
    const items = requestNamesByDepth.get(depth) ?? []
    const previousDepthY = depth === 0 ? undefined : requestPlaced
    if (depth === 0) {
      requestBottom = Math.max(requestBottom, placeTargetColumn(
        depth,
        items,
        requestX[depth] ?? 0,
        (name) => endpointByName.get(name),
        requestPlaced,
      ))
    } else {
      const targetFromPrevious = (name: string) => {
        let target: number | undefined
        for (const [sourceName, sourceY] of previousDepthY ?? []) {
          if ((usesTargets.get(sourceName) ?? []).includes(name)) {
            target = Math.min(target ?? Number.MAX_SAFE_INTEGER, sourceY)
          }
        }
        return target
      }
      requestBottom = Math.max(requestBottom, placeTargetColumn(
        depth,
        items,
        requestX[depth] ?? 0,
        targetFromPrevious,
        requestPlaced,
      ))
    }
  }

  const responseColumnCount = responseReach.size > 0 ? Math.max(...responseReach.values()) + 1 : 0
  const responseWidths = Array.from({ length: responseColumnCount }, (_, depth) => (
    schemas.filter((node) => responseReach.get(field(node, 'name')) === depth)
      .reduce((max, node) => Math.max(max, nodeSize(node, resolvedSizes).width), 0)
  ))
  const responseStartX = laneX + laneWidth + COLUMN_GAP
  const responseX: number[] = []
  let responseCursor = responseStartX
  for (let depth = 0; depth < responseColumnCount; depth += 1) {
    responseX[depth] = responseCursor
    responseCursor += (responseWidths[depth] ?? 0) + COLUMN_GAP
  }
  const responseNamesByDepth = new Map<number, CanvasNode[]>()
  for (const node of schemas) {
    const depth = responseReach.get(field(node, 'name'))
    if (depth == null) continue
    const list = responseNamesByDepth.get(depth) ?? []
    list.push(node)
    responseNamesByDepth.set(depth, list)
  }
  const responsePlaced = new Map<string, number>()
  for (let depth = 0; depth < responseColumnCount; depth += 1) {
    const items = responseNamesByDepth.get(depth) ?? []
    const previousDepthY = depth === 0 ? undefined : responsePlaced
    const targetFor = depth === 0
      ? (name: string) => endpointByName.get(name)
      : (name: string) => {
        let target: number | undefined
        for (const [sourceName, sourceY] of previousDepthY ?? []) {
          if ((usesTargets.get(sourceName) ?? []).includes(name)) {
            target = Math.min(target ?? Number.MAX_SAFE_INTEGER, sourceY)
          }
        }
        return target
      }
    responseBottom = Math.max(responseBottom, placeTargetColumn(
      depth,
      items,
      responseX[depth] ?? responseStartX,
      targetFor,
      responsePlaced,
    ))
  }

  const sharedOrder: string[] = []
  const sharedQueue = [...sharedSeeds].sort((a, b) => (
    (endpointByName.get(a) ?? Number.MAX_SAFE_INTEGER) - (endpointByName.get(b) ?? Number.MAX_SAFE_INTEGER)
    || a.localeCompare(b)
  ))
  while (sharedQueue.length > 0) {
    const name = sharedQueue.shift()!
    if (!sharedReach.has(name) || sharedOrder.includes(name)) continue
    sharedOrder.push(name)
    for (const target of usesTargets.get(name) ?? []) {
      if (sharedReach.has(target) && !sharedOrder.includes(target)) sharedQueue.push(target)
    }
  }
  const sharedTop = Math.max(lanesBottom, responseBottom, requestBottom) + COLUMN_GAP
  let sharedX = laneX
  let sharedHeight = 0
  for (const name of sharedOrder) {
    const node = schemaByName.get(name)
    if (!node) continue
    const size = nodeSize(node, resolvedSizes)
    positions.set(node.id, { x: sharedX, y: sharedTop })
    modelY.set(name, sharedTop)
    sharedX += size.width + MODEL_GAP
    sharedHeight = Math.max(sharedHeight, size.height)
  }
  const unused = schemas
    .filter((node) => !requestReach.has(field(node, 'name'))
      && !responseReach.has(field(node, 'name'))
      && !sharedReach.has(field(node, 'name')))
    .sort((a, b) => field(a, 'name').localeCompare(field(b, 'name')))
  let unusedX = 0
  const unusedTop = Math.max(sharedTop + sharedHeight + (sharedOrder.length ? COLUMN_GAP : 0), lanesBottom + COLUMN_GAP)
  for (const node of unused) {
    const size = nodeSize(node, resolvedSizes)
    positions.set(node.id, { x: unusedX, y: unusedTop })
    modelY.set(field(node, 'name'), unusedTop)
    unusedX += size.width + MODEL_GAP
  }

  const nextNodes = nodes.map((node) => {
    const position = positions.get(node.id)
    if (!position) return node
    const size = resolvedSizes[node.id]
    return {
      ...node,
      x: Math.round(position.x),
      y: Math.round(position.y),
      ...(size ? { width: Math.round(size.width), height: Math.round(size.height) } : {}),
    }
  })
  return { ...canvas, nodes: nextNodes }
}


interface PlacementRect {
  x: number
  y: number
  width: number
  height: number
}

function horizontalOverlap(left: PlacementRect, right: PlacementRect): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x
}

function rectFor(node: CanvasNode, sizes: ApiSizeMap): PlacementRect {
  const size = nodeSize(node, sizes)
  return { x: node.x, y: node.y, width: size.width, height: size.height }
}

function overlaps(left: PlacementRect, right: PlacementRect): boolean {
  return horizontalOverlap(left, right)
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

function pushBelow(rect: PlacementRect, obstacles: PlacementRect[]): number {
  let y = Math.max(0, rect.y)
  let moved = true
  while (moved) {
    moved = false
    const candidate = { ...rect, y }
    for (const obstacle of obstacles) {
      if (!overlaps(candidate, obstacle)) continue
      y = obstacle.y + obstacle.height + MODEL_GAP
      moved = true
    }
  }
  return y
}

export function placeNewApiCards(
  canvas: JsonCanvas,
  additions: CanvasNode[],
  sizes: ApiSizeMap = {},
): CanvasNode[] {
  if (additions.length === 0) return []
  const existing = canvas.nodes ?? []
  const placed = additions.map((node) => ({ ...node }))
  const addedResources = placed.filter((node) => getEntityMeta(node)?.entityType === 'resource')
  const addedEndpoints = placed.filter((node) => getEntityMeta(node)?.entityType === 'endpoint')
  const addedSchemas = placed.filter((node) => getEntityMeta(node)?.entityType === 'schema')
  const existingResources = existing
    .filter((node) => getEntityMeta(node)?.entityType === 'resource')
    .sort(resourceOrder)
  const laneX = existingResources.length > 0
    ? Math.min(...existingResources.map((node) => node.x))
    : Math.max(0, ...existing.map((node) => node.x + nodeSize(node, sizes).width + COLUMN_GAP))
  const endpointWidth = Math.max(0, ...addedEndpoints.map((node) => nodeSize(node, sizes).width))
  const laneWidth = endpointWidth > 0 ? endpointWidth + LANE_PADDING * 2 : 408
  const laneBaseY = existingResources.length > 0
    ? Math.max(...existingResources.map((node) => node.y + nodeSize(node, sizes).height))
    : Math.max(0, ...existing.map((node) => node.y + nodeSize(node, sizes).height))
  const laneObstacles = existing
    .map((node) => rectFor(node, sizes))
    .filter((rect) => horizontalOverlap({ x: laneX, y: 0, width: laneWidth, height: 1 }, rect))
  const laneY = Math.max(
    laneBaseY,
    ...laneObstacles.map((rect) => rect.y + rect.height),
  ) + LANE_GAP

  const orderedEndpoints = [...addedEndpoints].sort((left, right) => endpointOrder(
    { path: field(left, 'path'), method: field(left, 'method') },
    { path: field(right, 'path'), method: field(right, 'method') },
  ))
  let endpointY = laneY + LANE_HEADER + LANE_PADDING
  const endpointById = new Map<string, CanvasNode>()
  for (const endpoint of orderedEndpoints) {
    const size = nodeSize(endpoint, sizes)
    endpoint.x = laneX + LANE_PADDING
    endpoint.y = endpointY
    endpoint.width = size.width
    endpoint.height = size.height
    endpointById.set(endpoint.id, endpoint)
    endpointY += size.height + ENDPOINT_GAP
  }
  const laneHeight = Math.max(
    LANE_HEADER + LANE_PADDING * 2,
    endpointY - ENDPOINT_GAP + LANE_PADDING - laneY,
  )
  for (const resource of addedResources) {
    resource.x = laneX
    resource.y = laneY
    resource.width = laneWidth
    resource.height = laneHeight
  }

  const reference = buildApiReferenceDocument([...existing, ...placed])
  const addedIds = new Set(orderedEndpoints.map((node) => node.id))
  const addedReferenceEndpoints = reference.resources
    .flatMap((resource) => resource.endpoints)
    .filter((endpoint) => addedIds.has(endpoint.id))
  const requestTargets = new Map<string, number>()
  const responseTargets = new Map<string, number>()
  const sharedTargets = new Map<string, number>()
  for (const endpoint of addedReferenceEndpoints) {
    const y = endpointById.get(endpoint.id)?.y ?? laneY
    for (const model of endpoint.requestModels) {
      requestTargets.set(model, Math.min(requestTargets.get(model) ?? y, y))
    }
    for (const response of endpoint.responses) {
      const model = response.model
      if (!model) continue
      if (/^[123]/.test(response.status)) {
        responseTargets.set(model, Math.min(responseTargets.get(model) ?? y, y))
      } else if (/^[45]/.test(response.status)) {
        sharedTargets.set(model, Math.min(sharedTargets.get(model) ?? y, y))
      }
    }
  }
  const schemaByName = new Map(addedSchemas.map((node) => [field(node, 'name'), node]))
  const requestNames = [...requestTargets.keys()].filter((name) => !responseTargets.has(name))
  const responseNames = [...responseTargets.keys()]
  const sharedNames = [...sharedTargets.keys()].filter((name) => (
    !requestTargets.has(name) && !responseTargets.has(name)
  ))
  const existingReference = buildApiReferenceDocument(existing)
  const existingEndpoints = existingReference.resources.flatMap((resource) => resource.endpoints)
  const existingRequestNames = new Set(existingEndpoints.flatMap((endpoint) => endpoint.requestModels))
  const existingResponseNames = new Set(existingEndpoints.flatMap((endpoint) => (
    endpoint.responses
      .filter((response) => /^[123]/.test(response.status) && response.model)
      .flatMap((response) => response.model!.split(', '))
  )))
  const requestColumns = existing
    .filter((node) => getEntityMeta(node)?.entityType === 'schema'
      && node.x < laneX
      && existingRequestNames.has(field(node, 'name'))
      && !existingResponseNames.has(field(node, 'name')))
    .map((node) => node.x)
  const responseColumns = existing
    .filter((node) => getEntityMeta(node)?.entityType === 'schema'
      && node.x > laneX
      && existingResponseNames.has(field(node, 'name')))
    .map((node) => node.x)
  const requestWidth = Math.max(0, ...requestNames.map((name) => (
    schemaByName.get(name) ? nodeSize(schemaByName.get(name)!, sizes).width : 0
  )))
  const requestX = requestColumns.length > 0
    ? Math.max(...requestColumns)
    : laneX - COLUMN_GAP - requestWidth
  const responseX = responseColumns.length > 0
    ? Math.min(...responseColumns)
    : laneX + laneWidth + COLUMN_GAP
  const sharedX = laneX
  const obstacles = [
    ...existing.map((node) => rectFor(node, sizes)),
    ...placed.filter((node) => !addedSchemas.includes(node)).map((node) => rectFor(node, sizes)),
  ]

  function placeModels(
    names: string[],
    targets: Map<string, number>,
    x: number,
    fallbackY: number,
  ): void {
    const ordered = names
      .flatMap((name) => {
        const node = schemaByName.get(name)
        return node ? [{ node, target: targets.get(name) ?? fallbackY }] : []
      })
      .sort((left, right) => left.target - right.target || field(left.node, 'name').localeCompare(field(right.node, 'name')))
    for (const { node, target } of ordered) {
      const size = nodeSize(node, sizes)
      const y = pushBelow({ x, y: target, width: size.width, height: size.height }, obstacles)
      node.x = x
      node.y = y
      node.width = size.width
      node.height = size.height
      obstacles.push({ x, y, width: size.width, height: size.height })
    }
  }

  placeModels(requestNames, requestTargets, requestX, laneY)
  placeModels(responseNames, responseTargets, responseX, laneY)
  const unusedY = Math.max(laneY + laneHeight, ...existing.map((node) => node.y + nodeSize(node, sizes).height)) + MODEL_GAP
  placeModels(sharedNames, sharedTargets, sharedX, unusedY)
  const referenced = new Set([...requestNames, ...responseNames, ...sharedNames])
  const unused = addedSchemas.filter((node) => !referenced.has(field(node, 'name')))
  placeModels(unused.map((node) => field(node, 'name')), new Map(), responseX, unusedY)

  return placed
}
