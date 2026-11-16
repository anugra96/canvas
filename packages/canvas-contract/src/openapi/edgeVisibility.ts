export interface ApiEdgeVisibilityInput {
  relationType?: string
  status?: string
  sourceType?: string
  securityOverride?: boolean
  usesNextColumn?: boolean
  usesShared?: boolean
}

export function shouldDrawApiEdge({
  relationType,
  status,
  sourceType,
  securityOverride,
  usesNextColumn,
  usesShared,
}: ApiEdgeVisibilityInput): boolean {
  if (relationType === 'contains') return false
  if (relationType === 'authenticates_via') {
    return sourceType === 'endpoint' && securityOverride === true
  }
  if (relationType === 'returns') return /^[123]/.test(status ?? '')
  if (relationType === 'uses') return usesNextColumn === true && usesShared !== true
  return true
}
