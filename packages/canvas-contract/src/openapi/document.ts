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

  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (!isObject(value)) return
    if (value.nullable === true) {
      counts.nullable += 1
      if (typeof value.type === 'string') value.type = [value.type, 'null']
      else if (Array.isArray(value.type) && !value.type.includes('null')) value.type.push('null')
      else {
        const wrapped = { ...value }
        for (const key of Object.keys(value)) delete value[key]
        value.anyOf = [wrapped, { type: 'null' }]
      }
      delete value.nullable
    }
    if ('example' in value) {
      counts.example += 1
      if (!('examples' in value)) value.examples = [value.example]
      delete value.example
    }
    if (value.exclusiveMinimum === true && typeof value.minimum === 'number') {
      counts.exclusive += 1
      value.exclusiveMinimum = value.minimum
      delete value.minimum
    } else if (value.exclusiveMinimum === false) {
      delete value.exclusiveMinimum
    }
    if (value.exclusiveMaximum === true && typeof value.maximum === 'number') {
      counts.exclusive += 1
      value.exclusiveMaximum = value.maximum
      delete value.maximum
    } else if (value.exclusiveMaximum === false) {
      delete value.exclusiveMaximum
    }
    for (const child of Object.values(value)) walk(child)
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
