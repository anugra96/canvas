import { isObject, objectOrEmpty, schemaNameFromRef } from './document'
import type { JsonObject } from './types'

const FORMAT_VALUES: Record<string, string> = {
  'date-time': '2024-01-01T00:00:00Z',
  date: '2024-01-01',
  uuid: '00000000-0000-4000-8000-000000000000',
  email: 'user@example.com',
  uri: 'https://example.com',
}

const STRING_FALLBACK = 'string'

function firstType(type: unknown): string | undefined {
  if (Array.isArray(type)) return type.find((value) => value !== 'null') as string | undefined
  return typeof type === 'string' ? type : undefined
}

function stringExample(schema: JsonObject): string {
  const format = typeof schema.format === 'string' ? schema.format : ''
  let value = FORMAT_VALUES[format] ?? STRING_FALLBACK
  const minLength = typeof schema.minLength === 'number' ? schema.minLength : 0
  while (value.length < minLength) value += 'x'
  const maxLength = typeof schema.maxLength === 'number' ? schema.maxLength : 0
  if (maxLength > 0) value = value.slice(0, maxLength)
  return value
}

export function generateExample(
  schema: unknown,
  schemas: Record<string, unknown>,
  depth = 0,
  includeOptional = true,
): unknown {
  if (depth > 8 || !isObject(schema)) return null
  if ('const' in schema) return schema.const
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0]
  if ('default' in schema) return schema.default
  const ref = schemaNameFromRef(schema.$ref)
  if (ref) {
    const target = schemas[ref]
    return target === undefined ? null : generateExample(target, schemas, depth + 1, includeOptional)
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return generateExample(schema.oneOf[0], schemas, depth + 1, includeOptional)
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return generateExample(schema.anyOf[0], schemas, depth + 1, includeOptional)
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) return generateExample(schema.allOf[0], schemas, depth + 1, includeOptional)
  const type = firstType(schema.type)
  if (type === 'object' || (!type && (schema.properties || schema.required))) {
    const properties = objectOrEmpty(schema.properties)
    const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : [])
    const result: JsonObject = {}
    for (const [name, value] of Object.entries(properties)) {
      if (!required.has(name) && !includeOptional) continue
      result[name] = generateExample(value, schemas, depth + 1, false)
    }
    return result
  }
  if (type === 'array' || (!type && schema.items)) {
    const minimum = typeof schema.minItems === 'number' ? schema.minItems : 1
    return Array.from({ length: Math.max(1, minimum) }, () => generateExample(schema.items, schemas, depth + 1, false))
  }
  if (type === 'integer') {
    return typeof schema.minimum === 'number' ? Math.ceil(schema.minimum) : 1
  }
  if (type === 'number') {
    return typeof schema.minimum === 'number' ? schema.minimum : 1
  }
  if (type === 'boolean') return true
  if (type === 'null') return null
  if (type === 'string' || !type) return stringExample(schema)
  return null
}
