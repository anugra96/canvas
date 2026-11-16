export interface ApiEdgeVisibilityInput {
  relationType?: string
  status?: string
  sourceType?: string
  securityOverride?: boolean
}

export function shouldDrawApiEdge({
  relationType,
  status,
  sourceType,
  securityOverride,
}: ApiEdgeVisibilityInput): boolean {
  if (relationType === 'contains') return false
  if (relationType === 'authenticates_via') {
    return sourceType === 'endpoint' && securityOverride === true
  }
  if (relationType === 'returns') return /^[123]/.test(status ?? '')
  return true
}
