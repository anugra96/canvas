import { getEntityMeta } from '../ontology'
import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import type { CanvasProfileIssue } from '../profile'
import { isObject, objectOrEmpty, schemaNameFromRef } from './document'
import { schemaReferences } from './managedRelations'
import { applyStandardErrors } from './standardErrors'
import type { JsonObject } from './types'

export type ApiCheckFix = 'missing_path_parameter' | 'standard_errors' | 'pagination' | 'tag'

function field(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

function nodeType(node: CanvasNode): string {
  return getEntityMeta(node)?.entityType ?? ''
}

function operationFor(node: CanvasNode): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(field(node, 'operation') || '{}')
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function schemaSourcesFor(nodes: CanvasNode[]): Map<string, unknown> {
  const sources = new Map<string, unknown>()
  for (const node of nodes.filter((candidate) => nodeType(candidate) === 'schema')) {
    try {
      sources.set(field(node, 'name'), JSON.parse(field(node, 'source')))
    } catch {
      // Invalid schema JSON is reported separately.
    }
  }
  return sources
}

function collectRefs(value: unknown, result: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, result)
    return result
  }
  if (!isObject(value)) return result
  if (typeof value.$ref === 'string') result.push(value.$ref)
  for (const child of Object.values(value)) collectRefs(child, result)
  return result
}

function resolveSchema(schema: unknown, sources: Map<string, unknown>, seen = new Set<string>()): unknown {
  if (!isObject(schema)) return schema
  const name = schemaNameFromRef(schema.$ref)
  if (!name) return schema
  if (seen.has(name)) return undefined
  seen.add(name)
  return resolveSchema(sources.get(name), sources, seen)
}

function isListSchema(schema: unknown, sources: Map<string, unknown>): boolean {
  const resolved = resolveSchema(schema, sources)
  if (!isObject(resolved)) return false
  if (resolved.type === 'array') return true
  const itemProperty = objectOrEmpty(objectOrEmpty(resolved.properties).items)
  return objectOrEmpty(resolveSchema(itemProperty, sources)).type === 'array'
}

function caseStyle(name: string): string | undefined {
  if (name.includes('_')) return 'snake_case'
  if (name.includes('-')) return 'kebab-case'
  if (/^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(name)) return 'camelCase'
  if (/^[A-Z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(name)) return 'PascalCase'
  return undefined
}

function propertyNames(schema: unknown, result: string[] = [], depth = 0): string[] {
  if (!isObject(schema) || depth > 8) return result
  const properties = objectOrEmpty(schema.properties)
  for (const [name, value] of Object.entries(properties)) {
    result.push(name)
    propertyNames(value, result, depth + 1)
  }
  if (isObject(schema.items)) propertyNames(schema.items, result, depth + 1)
  return result
}

export function validateApiDesign(canvas: JsonCanvas): CanvasProfileIssue[] {
  const nodes = canvas.nodes ?? []
  const endpoints = nodes.filter((node) => nodeType(node) === 'endpoint')
  const schemas = nodes.filter((node) => nodeType(node) === 'schema')
  const api = nodes.find((node) => nodeType(node) === 'api_definition')
  const sources = schemaSourcesFor(nodes)
  const schemaNames = new Set(schemas.map((node) => field(node, 'name')).filter(Boolean))
  let extra: JsonObject = {}
  if (api) {
    try {
      const parsed: unknown = JSON.parse(field(api, 'extra') || '{}')
      if (isObject(parsed)) extra = parsed
    } catch {
      extra = {}
    }
  }
  const componentRefs = new Set<string>()
  const components = objectOrEmpty(extra.components)
  for (const [section, entries] of Object.entries(components)) {
    if (!isObject(entries)) continue
    for (const name of Object.keys(entries)) componentRefs.add(`#/components/${section}/${name}`)
  }
  const topSecurityDefined = 'security' in extra
  const issues: CanvasProfileIssue[] = []

  function unresolvedRef(ref: string): boolean {
    if (!ref.startsWith('#/components/')) return false
    if (ref.startsWith('#/components/schemas/')) {
      return !schemaNames.has(decodeURIComponent(ref.slice('#/components/schemas/'.length))) && !componentRefs.has(ref)
    }
    return !componentRefs.has(ref)
  }

  const operations = new Map<string, JsonObject>()
  for (const endpoint of endpoints) {
    const operation = operationFor(endpoint)
    if (!operation) continue
    operations.set(endpoint.id, operation)
    const refs = [...new Set(collectRefs(operation))].filter(unresolvedRef)
    if (refs.length > 0) {
      issues.push({
        code: 'ref_unresolved',
        severity: 'error',
        message: `Endpoint "${field(endpoint, 'method')} ${field(endpoint, 'path')}" has unresolved ${refs[0]}.`,
        nodeId: endpoint.id,
      })
    }
  }
  for (const schema of schemas) {
    const source = sources.get(field(schema, 'name'))
    if (source === undefined) continue
    const refs = [...new Set(collectRefs(source))].filter(unresolvedRef)
    if (refs.length > 0) {
      issues.push({
        code: 'ref_unresolved',
        severity: 'error',
        message: `Schema "${field(schema, 'name')}" has unresolved ${refs[0]}.`,
        nodeId: schema.id,
      })
    }
  }

  const duplicateIds = new Set<string>()
  const methodPaths = new Map<string, CanvasNode[]>()
  const operationIds = new Map<string, CanvasNode[]>()
  for (const endpoint of endpoints) {
    const operation = operations.get(endpoint.id)
    if (!operation) continue
    const key = `${field(endpoint, 'method').toUpperCase()} ${field(endpoint, 'path')}`
    methodPaths.set(key, [...(methodPaths.get(key) ?? []), endpoint])
    const operationId = typeof operation.operationId === 'string' ? operation.operationId.trim() : ''
    if (operationId) operationIds.set(operationId, [...(operationIds.get(operationId) ?? []), endpoint])
  }
  for (const list of methodPaths.values()) {
    if (list.length < 2) continue
    for (const endpoint of list) duplicateIds.add(endpoint.id)
  }
  for (const list of operationIds.values()) {
    if (list.length < 2) continue
    for (const endpoint of list) duplicateIds.add(endpoint.id)
  }
  for (const endpoint of endpoints.filter((node) => duplicateIds.has(node.id))) {
    issues.push({
      code: 'operation_duplicate',
      severity: 'error',
      message: `Endpoint "${field(endpoint, 'method')} ${field(endpoint, 'path')}" shares a method, path, or operationId.`,
      nodeId: endpoint.id,
    })
  }

  for (const endpoint of endpoints) {
    const operation = operations.get(endpoint.id)
    if (!operation) continue
    const method = field(endpoint, 'method').toUpperCase()
    const path = field(endpoint, 'path')
    const parameters = Array.isArray(operation.parameters) ? operation.parameters.filter(isObject) : []
    const pathNames = new Set([...path.matchAll(/\{([^}]+)\}/g)].flatMap((match) => match[1] ? [match[1]] : []))
    const declared = new Set(parameters.filter((parameter) => parameter.in === 'path').map((parameter) => String(parameter.name ?? '')))
    const missing = [...pathNames].filter((name) => !declared.has(name))
    const extraParameters = [...declared].filter((name) => !pathNames.has(name))
    if (missing.length > 0 || extraParameters.length > 0) {
      issues.push({
        code: 'path_parameter_mismatch',
        severity: 'error',
        message: missing.length > 0
          ? `Missing path parameter ${missing.map((name) => `"${name}"`).join(', ')}.`
          : `Path parameter ${extraParameters.map((name) => `"${name}"`).join(', ')} is not in the path.`,
        nodeId: endpoint.id,
      })
    }

    const responses = objectOrEmpty(operation.responses)
    if (!Object.keys(responses).some((status) => /^[23]/.test(status))) {
      issues.push({
        code: 'response_success_missing',
        severity: 'warning',
        message: `Endpoint "${method} ${path}" has no 2XX or 3XX response.`,
        nodeId: endpoint.id,
      })
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
      && !Object.keys(responses).some((status) => /^4/.test(status))) {
      issues.push({
        code: 'mutation_errors_missing',
        severity: 'warning',
        message: `Endpoint "${method} ${path}" has no 4XX response.`,
        nodeId: endpoint.id,
      })
    }
    if (!('security' in operation) && !topSecurityDefined) {
      issues.push({
        code: 'security_missing',
        severity: 'warning',
        message: `Endpoint "${method} ${path}" has no security at any level.`,
        nodeId: endpoint.id,
      })
    }
    if (method === 'GET') {
      const successSchemas = Object.entries(responses)
        .filter(([status]) => /^[23]/.test(status))
        .flatMap(([, response]) => Object.values(objectOrEmpty(objectOrEmpty(response).content)))
        .map((media) => objectOrEmpty(media).schema)
      const isList = successSchemas.some((schema) => isListSchema(schema, sources))
      const hasPagination = parameters.some((parameter) => (
        parameter.in === 'query' && ['limit', 'cursor'].includes(String(parameter.name))
      ))
      if (isList && !hasPagination) {
        issues.push({
          code: 'list_pagination_missing',
          severity: 'warning',
          message: `Endpoint "${method} ${path}" lists items without a limit or cursor parameter.`,
          nodeId: endpoint.id,
        })
      }
    }
    if (['GET', 'DELETE'].includes(method) && 'requestBody' in operation) {
      issues.push({
        code: 'get_with_body',
        severity: 'warning',
        message: `Endpoint "${method} ${path}" has a request body.`,
        nodeId: endpoint.id,
      })
    }
    const tags = Array.isArray(operation.tags)
      ? operation.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()))
      : []
    if (tags.length === 0) {
      issues.push({
        code: 'endpoint_without_resource',
        severity: 'warning',
        message: `Endpoint "${method} ${path}" has no tag.`,
        nodeId: endpoint.id,
      })
    }
  }

  const styleCounts = new Map<string, number>()
  const endpointNames = new Map<string, string[]>()
  for (const endpoint of endpoints) {
    const operation = operations.get(endpoint.id)
    if (!operation) continue
    const pathNames = field(endpoint, 'path').split('/').filter((segment) => segment && !segment.startsWith('{'))
    const parameterNames = (Array.isArray(operation.parameters) ? operation.parameters : [])
      .filter(isObject)
      .map((parameter) => String(parameter.name ?? ''))
    const names = [...pathNames, ...parameterNames]
    endpointNames.set(endpoint.id, names)
    for (const name of names) {
      const style = caseStyle(name)
      if (style) styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1)
    }
  }
  const schemaPropertyNames = new Map<string, string[]>()
  for (const schema of schemas) {
    const names = propertyNames(sources.get(field(schema, 'name')))
    schemaPropertyNames.set(schema.id, names)
    for (const name of names) {
      const style = caseStyle(name)
      if (style) styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1)
    }
  }
  const majority = [...styleCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
  if (majority) {
    for (const endpoint of endpoints) {
      const inconsistent = (endpointNames.get(endpoint.id) ?? [])
        .filter((name) => {
          const style = caseStyle(name)
          return style !== undefined && style !== majority
        })
      if (inconsistent.length > 0) {
        issues.push({
          code: 'naming_inconsistent',
          severity: 'warning',
          message: `Endpoint "${field(endpoint, 'method')} ${field(endpoint, 'path')}" has ${inconsistent.map((name) => `"${name}"`).join(', ')} outside ${majority}.`,
          nodeId: endpoint.id,
        })
      }
    }
    for (const schema of schemas) {
      const inconsistent = (schemaPropertyNames.get(schema.id) ?? [])
        .filter((name) => {
          const style = caseStyle(name)
          return style !== undefined && style !== majority
        })
      if (inconsistent.length > 0) {
        issues.push({
          code: 'naming_inconsistent',
          severity: 'warning',
          message: `Schema "${field(schema, 'name')}" has ${inconsistent.map((name) => `"${name}"`).join(', ')} outside ${majority}.`,
          nodeId: schema.id,
        })
      }
    }
  }

  const referencedSchemas = new Set<string>()
  for (const operation of operations.values()) {
    for (const name of schemaReferences(operation)) referencedSchemas.add(name)
  }
  for (const schema of schemas) {
    const source = sources.get(field(schema, 'name'))
    if (source === undefined) continue
    for (const name of schemaReferences(source)) referencedSchemas.add(name)
  }
  for (const schema of schemas) {
    const name = field(schema, 'name')
    if (name && !referencedSchemas.has(name)) {
      issues.push({
        code: 'schema_unused',
        severity: 'warning',
        message: `Schema "${name}" is not referenced by an endpoint or schema.`,
        nodeId: schema.id,
      })
    }
  }

  return issues
}

export function applyApiCheckFix(
  canvas: JsonCanvas,
  endpointId: string,
  fix: ApiCheckFix,
): CanvasNode[] {
  if (fix === 'standard_errors') {
    return applyStandardErrors(canvas, [endpointId]).nodes
  }
  const nodes = (canvas.nodes ?? []).map((node) => structuredClone(node))
  const endpoint = nodes.find((node) => node.id === endpointId && nodeType(node) === 'endpoint')
  if (!endpoint) return nodes
  const operation = operationFor(endpoint)
  if (!operation) return nodes
  const next = structuredClone(operation)
  const path = field(endpoint, 'path')
  const parameters = Array.isArray(next.parameters) ? next.parameters.filter(isObject) : []
  if (fix === 'missing_path_parameter') {
    const declared = new Set(parameters.filter((parameter) => parameter.in === 'path').map((parameter) => String(parameter.name ?? '')))
    for (const match of path.matchAll(/\{([^}]+)\}/g)) {
      const name = match[1]
      if (!name || declared.has(name)) continue
      parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } })
    }
    next.parameters = parameters
  } else if (fix === 'pagination') {
    const names = new Set(parameters.filter((parameter) => parameter.in === 'query').map((parameter) => String(parameter.name ?? '')))
    if (!names.has('limit')) {
      parameters.push({ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } })
    }
    if (!names.has('cursor')) {
      parameters.push({ name: 'cursor', in: 'query', schema: { type: 'string' } })
    }
    next.parameters = parameters
  } else if (fix === 'tag') {
    const segment = path.split('/').find((part) => part && !part.startsWith('{'))
    if (segment) next.tags = [segment]
  }
  endpoint.app = {
    ...(endpoint.app ?? {}),
    fields: { ...(getEntityMeta(endpoint)?.fields ?? {}), operation: JSON.stringify(next, null, 2) },
  }
  return nodes
}
