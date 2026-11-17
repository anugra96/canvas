import {
  ANNOTATION_ENTITY_TYPES,
  EDGE_CLASSES,
  edgeClass,
  findEntityType,
  getEdgeMeta,
  getEntityMeta,
  shouldDrawApiEdge,
  type ApiReferenceDocument,
  type CanvasEdge,
  type CanvasNode,
  type EdgeClass,
  type Ontology,
} from '@canvas/contract'

export const DISPLAY_PRESETS = ['minimal', 'standard', 'all', 'custom'] as const

export type DisplayPreset = (typeof DISPLAY_PRESETS)[number]

export const DISPLAY_CLASSES = EDGE_CLASSES.filter((edgeClass): edgeClass is EdgeClass => (
  edgeClass !== 'unspecified'
))

export const PRESET_CLASSES: Record<Exclude<DisplayPreset, 'custom'>, EdgeClass[]> = {
  minimal: ['flow'],
  standard: ['flow', 'contract', 'access'],
  all: ['flow', 'contract', 'structure', 'access', 'annotation'],
}

export interface CanvasDisplayState {
  preset: DisplayPreset
  classes: EdgeClass[]
  hiddenCardTypes: string[]
}

export interface DisplayCardType {
  id: string
  label: string
  count: number
}

export interface DisplayView {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  hiddenCards: number
  hiddenEdges: number
  hiddenCardIds: Set<string>
  visibleNodeIds: Set<string>
}

export interface ComputeDisplayInput {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  state: CanvasDisplayState
  selectedIds?: ReadonlySet<string>
  revealedCardIds?: ReadonlySet<string>
  ontology: Ontology
  apiReference?: ApiReferenceDocument | null
}

const STORAGE_PREFIX = 'canvas.display.'
const ANNOTATION_GROUP = 'annotation'

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function storageKey(canvasId: string): string {
  return `${STORAGE_PREFIX}${canvasId}`
}

export function displayPresetLabel(preset: DisplayPreset): string {
  if (preset === 'minimal') return 'Minimal'
  if (preset === 'standard') return 'Standard'
  if (preset === 'all') return 'All'
  return 'Custom'
}

export function defaultDisplayPreset(profileId: string): Exclude<DisplayPreset, 'custom'> {
  if (profileId === 'systems' || profileId === 'api' || profileId === 'database') return 'standard'
  return 'all'
}

export function defaultDisplayState(profileId: string): CanvasDisplayState {
  const preset = defaultDisplayPreset(profileId)
  return {
    preset,
    classes: [...PRESET_CLASSES[preset]],
    hiddenCardTypes: [],
  }
}

function isPreset(value: unknown): value is DisplayPreset {
  return typeof value === 'string' && DISPLAY_PRESETS.includes(value as DisplayPreset)
}

function isDisplayClass(value: unknown): value is EdgeClass {
  return typeof value === 'string' && DISPLAY_CLASSES.includes(value as EdgeClass)
}

export function readDisplayState(canvasId: string, profileId: string): CanvasDisplayState {
  const fallback = defaultDisplayState(profileId)
  try {
    const raw = storage()?.getItem(storageKey(canvasId))
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback
    const value = parsed as Partial<CanvasDisplayState>
    const preset = isPreset(value.preset) ? value.preset : fallback.preset
    const presetClasses = preset === 'custom' ? fallback.classes : PRESET_CLASSES[preset]
    return {
      preset,
      classes: Array.isArray(value.classes)
        ? value.classes.filter(isDisplayClass)
        : [...presetClasses],
      hiddenCardTypes: Array.isArray(value.hiddenCardTypes)
        ? value.hiddenCardTypes.filter((type): type is string => typeof type === 'string')
        : [],
    }
  } catch {
    return fallback
  }
}

export function writeDisplayState(canvasId: string, state: CanvasDisplayState): void {
  try {
    storage()?.setItem(storageKey(canvasId), JSON.stringify(state))
  } catch {
    // Display preferences are best-effort.
  }
}

export function resetDisplayState(canvasId: string, profileId: string): CanvasDisplayState {
  try {
    storage()?.removeItem(storageKey(canvasId))
  } catch {
    // Display preferences are best-effort.
  }
  return defaultDisplayState(profileId)
}

export function selectDisplayPreset(
  state: CanvasDisplayState,
  preset: Exclude<DisplayPreset, 'custom'>,
): CanvasDisplayState {
  return {
    preset,
    classes: [...PRESET_CLASSES[preset]],
    hiddenCardTypes: [],
  }
}

export function toggleDisplayClass(state: CanvasDisplayState, edgeClass: EdgeClass): CanvasDisplayState {
  if (!DISPLAY_CLASSES.includes(edgeClass)) return state
  const classes = state.classes.includes(edgeClass)
    ? state.classes.filter((current) => current !== edgeClass)
    : [...state.classes, edgeClass]
  return { ...state, preset: 'custom', classes }
}

export function toggleDisplayCardType(state: CanvasDisplayState, typeId: string): CanvasDisplayState {
  const hiddenCardTypes = state.hiddenCardTypes.includes(typeId)
    ? state.hiddenCardTypes.filter((current) => current !== typeId)
    : [...state.hiddenCardTypes, typeId]
  return { ...state, preset: 'custom', hiddenCardTypes }
}

export function displayClassVisible(state: CanvasDisplayState, edgeClass: EdgeClass): boolean {
  return edgeClass === 'unspecified' || state.classes.includes(edgeClass)
}

export function displayCardTypeId(node: CanvasNode): string | null {
  if (node.type === 'group') return null
  const entityType = getEntityMeta(node)?.entityType
  if (entityType && ANNOTATION_ENTITY_TYPES.has(entityType)) return ANNOTATION_GROUP
  return entityType ?? node.type
}

export function displayCardTypeLabel(typeId: string, ontology: Ontology): string {
  if (typeId === ANNOTATION_GROUP) return 'Annotations'
  const entityType = findEntityType(ontology, typeId)
  if (entityType) return entityType.label
  if (typeId === 'text') return 'Text'
  if (typeId === 'file') return 'File'
  if (typeId === 'link') return 'Link'
  return typeId
}

export function displayCardTypes(nodes: CanvasNode[], ontology: Ontology): DisplayCardType[] {
  const counts = new Map<string, number>()
  for (const node of nodes) {
    const typeId = displayCardTypeId(node)
    if (!typeId) continue
    counts.set(typeId, (counts.get(typeId) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: displayCardTypeLabel(id, ontology), count }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))
}

interface ApiEdgeLookups {
  modelPlacement: ApiReferenceDocument['modelPlacement']
  endpoints: Map<string, ApiReferenceDocument['resources'][number]['endpoints'][number]>
  modelNames: Map<string, string>
  entityTypes: Map<string, string | undefined>
}

function buildApiEdgeLookups(
  nodeById: Map<string, CanvasNode>,
  apiReference: ApiReferenceDocument,
): ApiEdgeLookups {
  const endpoints = new Map(apiReference.resources.flatMap((resource) => (
    resource.endpoints.map((endpoint) => [endpoint.id, endpoint] as const)
  )))
  const modelNames = new Map<string, string>()
  const entityTypes = new Map<string, string | undefined>()
  for (const node of nodeById.values()) {
    const meta = getEntityMeta(node)
    modelNames.set(node.id, String(meta?.fields.name ?? ''))
    entityTypes.set(node.id, meta?.entityType)
  }
  return {
    modelPlacement: apiReference.modelPlacement,
    endpoints,
    modelNames,
    entityTypes,
  }
}

function apiEdgeDrawn(edge: CanvasEdge, lookups: ApiEdgeLookups): boolean {
  const meta = getEdgeMeta(edge)
  const sourcePlacement = lookups.modelPlacement[lookups.modelNames.get(edge.fromNode) ?? '']
  const targetPlacement = lookups.modelPlacement[lookups.modelNames.get(edge.toNode) ?? '']
  return shouldDrawApiEdge({
    relationType: meta?.relationType,
    status: meta?.status ?? edge.label,
    sourceType: lookups.entityTypes.get(edge.fromNode),
    securityOverride: lookups.endpoints.get(edge.fromNode)?.securityOverride,
    usesNextColumn: Boolean(sourcePlacement
      && targetPlacement
      && sourcePlacement.region === targetPlacement.region
      && sourcePlacement.region !== 'shared'
      && targetPlacement.depth === sourcePlacement.depth + 1),
    usesShared: targetPlacement?.region === 'shared',
  })
}

export function computeDisplay({
  nodes,
  edges,
  state,
  selectedIds = new Set(),
  revealedCardIds = new Set(),
  ontology,
  apiReference,
}: ComputeDisplayInput): DisplayView {
  const hiddenTypes = new Set(state.hiddenCardTypes)
  const visibleNodeIds = new Set<string>()
  const hiddenCardIds = new Set<string>()
  for (const node of nodes) {
    const typeId = displayCardTypeId(node)
    if (!typeId) {
      visibleNodeIds.add(node.id)
      continue
    }
    if (!hiddenTypes.has(typeId) || revealedCardIds.has(node.id)) {
      visibleNodeIds.add(node.id)
    } else {
      hiddenCardIds.add(node.id)
    }
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const apiLookups = state.preset !== 'all' && apiReference
    ? buildApiEdgeLookups(nodeById, apiReference)
    : null
  const drawnEdges = edges.filter((edge) => {
    if (!visibleNodeIds.has(edge.fromNode) || !visibleNodeIds.has(edge.toNode)) return false
    if (selectedIds.has(edge.fromNode) || selectedIds.has(edge.toNode)) return true
    const source = nodeById.get(edge.fromNode)
    const target = nodeById.get(edge.toNode)
    if (!displayClassVisible(state, edgeClass(edge, source, target, ontology))) return false
    if (apiLookups) {
      return apiEdgeDrawn(edge, apiLookups)
    }
    return true
  })
  const drawnIds = new Set(drawnEdges.map((edge) => edge.id))

  return {
    nodes: nodes.filter((node) => visibleNodeIds.has(node.id)),
    edges: drawnEdges,
    hiddenCards: hiddenCardIds.size,
    hiddenEdges: edges.filter((edge) => !drawnIds.has(edge.id)).length,
    hiddenCardIds,
    visibleNodeIds,
  }
}
