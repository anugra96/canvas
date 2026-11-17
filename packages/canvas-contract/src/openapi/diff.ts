import { isObject, objectOrEmpty } from './document'
import type { JsonObject } from './types'

export interface ApiChange {
  kind: string
  message: string
  warning?: boolean
}

export interface ApiEndpointDiff {
  breaking: ApiChange[]
  compatible: ApiChange[]
}

export interface OpenApiDiffResult {
  endpoints: Record<string, ApiEndpointDiff>
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const

function endpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

function resolvePointer(document: JsonObject, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined
  let current: unknown = document
  for (const part of ref.slice(2).split('/')) {
    const key = decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~')
    if (!isObject(current) && !Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function resolveSchema(document: JsonObject, schema: unknown, seen: Set<string>): JsonObject | undefined {
  if (!isObject(schema)) return undefined
  if (typeof schema.$ref === 'string') {
    if (seen.has(schema.$ref)) return undefined
    seen.add(schema.$ref)
    return resolveSchema(document, resolvePointer(document, schema.$ref), seen)
  }
  if (!Array.isArray(schema.allOf) || schema.allOf.length === 0) return schema
  const merged: JsonObject = { ...schema }
  const properties: JsonObject = { ...objectOrEmpty(schema.properties) }
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : [])
  for (const child of schema.allOf) {
    const resolved = resolveSchema(document, child, seen)
    if (!resolved) continue
    Object.assign(properties, objectOrEmpty(resolved.properties))
    for (const name of Array.isArray(resolved.required) ? resolved.required : []) required.add(String(name))
  }
  merged.properties = properties
  if (required.size > 0) merged.required = [...required]
  return merged
}

function enumValues(schema: JsonObject | undefined): string[] {
  return Array.isArray(schema?.enum) ? schema.enum.map(String) : []
}

function requestSchemaChanges(
  base: JsonObject,
  head: JsonObject,
  baseSchema: unknown,
  headSchema: unknown,
  prefix: string,
  breaking: ApiChange[],
  compatible: ApiChange[],
  depth = 0,
): void {
  if (depth > 12) return
  const left = resolveSchema(base, baseSchema, new Set())
  const right = resolveSchema(head, headSchema, new Set())
  if (!left || !right) return
  const leftProperties = objectOrEmpty(left.properties)
  const rightProperties = objectOrEmpty(right.properties)
  const leftRequired = new Set(Array.isArray(left.required) ? left.required.map(String) : [])
  const rightRequired = new Set(Array.isArray(right.required) ? right.required.map(String) : [])
  for (const [name, schema] of Object.entries(rightProperties)) {
    const path = prefix ? `${prefix}.${name}` : name
    if (!(name in leftProperties)) {
      if (rightRequired.has(name)) {
        breaking.push({ kind: 'request_property_required', message: `Request property "${path}" is newly required.` })
      } else {
        compatible.push({ kind: 'request_property_optional', message: `Optional request property "${path}" added.` })
      }
    } else if (!leftRequired.has(name) && rightRequired.has(name)) {
      breaking.push({ kind: 'request_property_required', message: `Request property "${path}" is newly required.` })
    }
    const leftChild = resolveSchema(base, leftProperties[name], new Set())
    const rightChild = resolveSchema(head, schema, new Set())
    const leftEnums = new Set(enumValues(leftChild))
    const rightEnums = new Set(enumValues(rightChild))
    for (const value of leftEnums) {
      if (!rightEnums.has(value)) {
        breaking.push({ kind: 'request_enum_removed', message: `Request enum value "${value}" removed from "${path}".` })
      }
    }
    for (const value of rightEnums) {
      if (!leftEnums.has(value)) {
        compatible.push({ kind: 'request_enum_added', message: `Request enum value "${value}" added to "${path}".` })
      }
    }
    requestSchemaChanges(base, head, leftProperties[name], schema, path, breaking, compatible, depth + 1)
  }
}

function responseSchemaChanges(
  base: JsonObject,
  head: JsonObject,
  baseSchema: unknown,
  headSchema: unknown,
  prefix: string,
  breaking: ApiChange[],
  compatible: ApiChange[],
  depth = 0,
): void {
  if (depth > 12) return
  const left = resolveSchema(base, baseSchema, new Set())
  const right = resolveSchema(head, headSchema, new Set())
  if (!left || !right) return
  const leftProperties = objectOrEmpty(left.properties)
  const rightProperties = objectOrEmpty(right.properties)
  const closed = right.additionalProperties === false
  for (const name of Object.keys(leftProperties)) {
    const path = prefix ? `${prefix}.${name}` : name
    if (!(name in rightProperties)) {
      breaking.push({ kind: 'response_property_removed', message: `Response property "${path}" removed.` })
      continue
    }
    const leftChild = resolveSchema(base, leftProperties[name], new Set())
    const rightChild = resolveSchema(head, rightProperties[name], new Set())
    if (leftChild?.type !== undefined && rightChild?.type !== undefined && leftChild.type !== rightChild.type) {
      breaking.push({ kind: 'response_property_type_changed', message: `Response property "${path}" type changed.` })
    }
    const leftEnums = new Set(enumValues(leftChild))
    const rightEnums = new Set(enumValues(rightChild))
    for (const value of rightEnums) {
      if (!leftEnums.has(value)) {
        breaking.push({
          kind: 'response_enum_added',
          message: `Response enum value "${value}" added to "${path}".`,
          warning: true,
        })
      }
    }
    responseSchemaChanges(base, head, leftProperties[name], rightProperties[name], path, breaking, compatible, depth + 1)
  }
  for (const [name, schema] of Object.entries(rightProperties)) {
    if (name in leftProperties) continue
    const path = prefix ? `${prefix}.${name}` : name
    compatible.push({
      kind: 'response_property_added',
      message: `Response property "${path}" added${closed ? '; schema forbids additional properties.' : '.'}`,
      ...(closed ? { warning: true } : {}),
    })
    responseSchemaChanges(base, head, undefined, schema, path, breaking, compatible, depth + 1)
  }
}

function effectiveSecurity(document: JsonObject, operation: JsonObject): unknown[] {
  if (Array.isArray(operation.security)) return operation.security
  return Array.isArray(document.security) ? document.security : []
}

function isPublic(security: unknown[]): boolean {
  return security.length === 0
    || security.every((requirement) => isObject(requirement) && Object.keys(requirement).length === 0)
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function diffEndpoint(
  key: string,
  base: JsonObject,
  head: JsonObject,
  baseOperation: JsonObject,
  headOperation: JsonObject,
): ApiEndpointDiff {
  const breaking: ApiChange[] = []
  const compatible: ApiChange[] = []
  const baseResponses = objectOrEmpty(baseOperation.responses)
  const headResponses = objectOrEmpty(headOperation.responses)
  for (const status of Object.keys(baseResponses)) {
    if (!(status in headResponses)) {
      breaking.push({ kind: 'response_status_removed', message: `Response status ${status} removed from ${key}.` })
      continue
    }
    const baseResponse = objectOrEmpty(baseResponses[status])
    const headResponse = objectOrEmpty(headResponses[status])
    if (!sameJson(baseResponse.description, headResponse.description)) {
      compatible.push({ kind: 'description_changed', message: `Response ${status} description changed on ${key}.` })
    }
    const baseContent = objectOrEmpty(baseResponse.content)
    const headContent = objectOrEmpty(headResponse.content)
    for (const mediaType of Object.keys(baseContent)) {
      if (!(mediaType in headContent)) continue
      const baseMedia = objectOrEmpty(baseContent[mediaType])
      const headMedia = objectOrEmpty(headContent[mediaType])
      if (!sameJson(baseMedia.example, headMedia.example)) {
        compatible.push({ kind: 'example_changed', message: `Response ${status} example changed on ${key}.` })
      }
      responseSchemaChanges(base, head, baseMedia.schema, headMedia.schema, '', breaking, compatible)
    }
  }

  if (!sameJson(baseOperation.description, headOperation.description)) {
    compatible.push({ kind: 'description_changed', message: `Description changed on ${key}.` })
  }
  const baseRequestContent = objectOrEmpty(objectOrEmpty(baseOperation.requestBody).content)
  const headRequestContent = objectOrEmpty(objectOrEmpty(headOperation.requestBody).content)
  for (const mediaType of Object.keys(baseRequestContent)) {
    if (!(mediaType in headRequestContent)) continue
    const baseMedia = objectOrEmpty(baseRequestContent[mediaType])
    const headMedia = objectOrEmpty(headRequestContent[mediaType])
    if (!sameJson(baseMedia.example, headMedia.example)) {
      compatible.push({ kind: 'example_changed', message: `Request example changed on ${key}.` })
    }
    requestSchemaChanges(base, head, baseMedia.schema, headMedia.schema, '', breaking, compatible)
  }

  const baseParameters = Array.isArray(baseOperation.parameters) ? baseOperation.parameters.filter(isObject) : []
  const headParameters = Array.isArray(headOperation.parameters) ? headOperation.parameters.filter(isObject) : []
  const baseParameterMap = new Map(baseParameters.map((parameter) => [`${parameter.in}:${parameter.name}`, parameter]))
  for (const parameter of headParameters) {
    const id = `${parameter.in}:${parameter.name}`
    const previous = baseParameterMap.get(id)
    if (!previous) {
      if (parameter.required === true) {
        breaking.push({ kind: 'required_parameter_added', message: `Required parameter "${parameter.name}" added to ${key}.` })
      } else {
        compatible.push({ kind: 'optional_parameter_added', message: `Optional parameter "${parameter.name}" added to ${key}.` })
      }
      continue
    }
    if (previous.required !== true && parameter.required === true) {
      breaking.push({ kind: 'parameter_required', message: `Parameter "${parameter.name}" is newly required on ${key}.` })
    }
    requestSchemaChanges(base, head, previous.schema, parameter.schema, String(parameter.name), breaking, compatible)
  }

  const baseSecurity = effectiveSecurity(base, baseOperation)
  const headSecurity = effectiveSecurity(head, headOperation)
  if (isPublic(baseSecurity) && !isPublic(headSecurity)) {
    breaking.push({ kind: 'security_added', message: `Security added to public endpoint ${key}.` })
  }
  return { breaking, compatible }
}

export function diffOpenApi(base: JsonObject, head: JsonObject): OpenApiDiffResult {
  const endpoints: Record<string, ApiEndpointDiff> = {}
  const basePaths = objectOrEmpty(base.paths)
  const headPaths = objectOrEmpty(head.paths)
  const baseEndpoints = new Map<string, { method: string; path: string; operation: JsonObject }>()
  const headEndpoints = new Map<string, { method: string; path: string; operation: JsonObject }>()
  for (const [path, item] of Object.entries(basePaths)) {
    if (!isObject(item)) continue
    for (const method of METHODS) {
      if (isObject(item[method])) baseEndpoints.set(endpointKey(method, path), { method, path, operation: item[method] })
    }
  }
  for (const [path, item] of Object.entries(headPaths)) {
    if (!isObject(item)) continue
    for (const method of METHODS) {
      if (isObject(item[method])) headEndpoints.set(endpointKey(method, path), { method, path, operation: item[method] })
    }
  }

  for (const [key, endpoint] of baseEndpoints) {
    const next = headEndpoints.get(key)
    if (!next) {
      endpoints[key] = {
        breaking: [{ kind: 'endpoint_removed', message: `Endpoint ${key} removed.` }],
        compatible: [],
      }
      continue
    }
    endpoints[key] = diffEndpoint(key, base, head, endpoint.operation, next.operation)
  }
  for (const key of headEndpoints.keys()) {
    if (baseEndpoints.has(key)) continue
    endpoints[key] = {
      breaking: [],
      compatible: [{ kind: 'endpoint_added', message: `Endpoint ${key} added.` }],
    }
  }
  return { endpoints }
}

export function toMarkdownChangelog(result: OpenApiDiffResult): string {
  const keys = Object.keys(result.endpoints).sort()
  const breaking = keys.filter((key) => (result.endpoints[key]?.breaking.length ?? 0) > 0)
  const compatible = keys.filter((key) => (result.endpoints[key]?.compatible.length ?? 0) > 0)
  if (breaking.length === 0 && compatible.length === 0) return '# API change summary\n\nNo changes.'
  const lines = ['# API change summary']
  if (breaking.length > 0) {
    lines.push('', '## Breaking')
    for (const key of breaking) {
      lines.push('', `### ${key}`)
      for (const change of result.endpoints[key]!.breaking) {
        lines.push(`- ${change.message}${change.warning ? ' (warning)' : ''}`)
      }
    }
  }
  if (compatible.length > 0) {
    lines.push('', '## Compatible')
    for (const key of compatible) {
      lines.push('', `### ${key}`)
      for (const change of result.endpoints[key]!.compatible) {
        lines.push(`- ${change.message}${change.warning ? ' (warning)' : ''}`)
      }
    }
  }
  return lines.join('\n')
}
