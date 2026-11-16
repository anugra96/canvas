import { parse as parseYaml } from 'yaml'

import type { JsonObject, OpenApiParseResult } from './types'

export function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function objectOrEmpty(value: unknown): JsonObject {
  return isObject(value) ? value : {}
}

export function cloneJson<T>(value: T): T {
  return structuredClone(value)
}

export function parseOpenApiSource(source: string | unknown): OpenApiParseResult {
  let parsed: unknown = source
  if (typeof source === 'string') {
    const text = source.trim()
    if (!text) throw new Error('Paste an OpenAPI document or choose a file.')
    try {
      parsed = JSON.parse(text)
    } catch {
      try {
        parsed = parseYaml(text)
      } catch {
        throw new Error('The document is not valid JSON or YAML.')
      }
    }
  }
  if (!isObject(parsed)) throw new Error('The OpenAPI document must be an object.')
  if ('swagger' in parsed) {
    throw new Error('Swagger 2.0 is not supported. Import an OpenAPI 3.1 document instead.')
  }
  const version = typeof parsed.openapi === 'string' ? parsed.openapi : ''
  if (!version.startsWith('3.1') && !version.startsWith('3.0')) {
    throw new Error('The document must use OpenAPI 3.1 or 3.0.')
  }
  if (version.startsWith('3.1')) {
    return { document: cloneJson(parsed), warnings: [] }
  }
  return convertOpenApi30(parsed)
}

interface ConversionCounts {
  nullable: number
  example: number
  exclusive: number
}

function convertOpenApi30(document: JsonObject): OpenApiParseResult {
  const counts: ConversionCounts = { nullable: 0, example: 0, exclusive: 0 }
  const converted = cloneJson(document)
  converted.openapi = '3.1.0'
  const schemaObjects = new WeakSet<object>()
  const skipKeys = new Set(['example', 'examples', 'default', 'enum'])

  function convertSchema(schema: unknown): void {
    if (!isObject(schema) || schemaObjects.has(schema)) return
    schemaObjects.add(schema)
    if (schema.nullable === true) {
      counts.nullable += 1
      if (typeof schema.type === 'string') {
        schema.type = [schema.type, 'null']
      } else if (Array.isArray(schema.type)) {
        if (!schema.type.includes('null')) schema.type.push('null')
      } else {
        const wrapped = { ...schema }
        delete wrapped.nullable
        for (const key of Object.keys(schema)) delete schema[key]
        schema.anyOf = [wrapped, { type: 'null' }]
      }
    }
    delete schema.nullable
    if ('example' in schema) {
      counts.example += 1
      if (!('examples' in schema)) schema.examples = [schema.example]
      delete schema.example
    }
    if (schema.exclusiveMinimum === true && typeof schema.minimum === 'number') {
      counts.exclusive += 1
      schema.exclusiveMinimum = schema.minimum
      delete schema.minimum
    } else if (schema.exclusiveMinimum === false) {
      delete schema.exclusiveMinimum
    }
    if (schema.exclusiveMaximum === true && typeof schema.maximum === 'number') {
      counts.exclusive += 1
      schema.exclusiveMaximum = schema.maximum
      delete schema.maximum
    } else if (schema.exclusiveMaximum === false) {
      delete schema.exclusiveMaximum
    }

    if (isObject(schema.properties)) {
      for (const child of Object.values(schema.properties)) convertSchema(child)
    }
    if (isObject(schema.patternProperties)) {
      for (const child of Object.values(schema.patternProperties)) convertSchema(child)
    }
    if (isObject(schema.dependentSchemas)) {
      for (const child of Object.values(schema.dependentSchemas)) convertSchema(child)
    }
    if (isObject(schema.$defs)) {
      for (const child of Object.values(schema.$defs)) convertSchema(child)
    }
    for (const key of ['items', 'not', 'additionalProperties', 'contains', 'propertyNames']) {
      convertSchema(schema[key])
    }
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      if (Array.isArray(schema[key])) {
        for (const child of schema[key] as unknown[]) convertSchema(child)
      }
    }
  }

  const components = objectOrEmpty(converted.components)
  if (isObject(components.schemas)) {
    for (const schema of Object.values(components.schemas)) convertSchema(schema)
  }

  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (!isObject(value) || schemaObjects.has(value)) return
    for (const [key, child] of Object.entries(value)) {
      if (skipKeys.has(key)) continue
      if (key === 'schema') {
        convertSchema(child)
        continue
      }
      walk(child)
    }
  }

  walk(converted)
  const warnings = counts.nullable || counts.example || counts.exclusive
    ? [`Converted OpenAPI 3.0 to 3.1: ${counts.nullable} nullable, ${counts.example} example, ${counts.exclusive} exclusive bounds.`]
    : ['Converted OpenAPI 3.0 to 3.1.']
  return { document: converted, warnings }
}

export function schemaNameFromRef(ref: unknown): string | undefined {
  if (typeof ref !== 'string') return undefined
  const match = /^#\/components\/schemas\/([^/]+)$/.exec(ref)
  return match ? decodeURIComponent(match[1]!) : undefined
}

export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]),
  )
}
