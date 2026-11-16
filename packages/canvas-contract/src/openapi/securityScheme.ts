import type { EntityFields } from '../ontology'
import { isObject, objectOrEmpty } from './document'
import type { JsonObject } from './types'

function string(value: unknown): string {
  return value == null ? '' : String(value)
}

function fieldPresent(fields: EntityFields, key: string): boolean {
  return Object.hasOwn(fields, key)
}

function parseDefinition(fields: EntityFields): JsonObject {
  try {
    const parsed: unknown = JSON.parse(string(fields.definition) || '{}')
    return isObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseFlows(value: unknown): JsonObject | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return isObject(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function buildSecuritySchemeDefinition(
  fields: EntityFields,
  base: JsonObject = parseDefinition(fields),
): JsonObject {
  const type = string(fields.type) || string(base.type) || 'http'
  const definition: JsonObject = { ...base, type }
  delete definition.scheme
  delete definition.bearerFormat
  delete definition.in
  delete definition.name
  delete definition.openIdConnectUrl
  delete definition.flows

  if (fieldPresent(fields, 'description')) {
    const description = string(fields.description).trim()
    if (description) definition.description = description
    else delete definition.description
  }

  if (type === 'http') {
    const scheme = string(fields.scheme) || string(base.scheme) || 'bearer'
    definition.scheme = scheme
    const bearerFormat = fieldPresent(fields, 'bearerFormat')
      ? string(fields.bearerFormat).trim()
      : string(base.bearerFormat)
    if (bearerFormat) definition.bearerFormat = bearerFormat
    else delete definition.bearerFormat
  } else if (type === 'apiKey') {
    definition.in = string(fields.in) || string(base.in) || 'header'
    const name = string(fields.parameterName) || string(base.name)
    if (name) definition.name = name
    else delete definition.name
  } else if (type === 'openIdConnect') {
    const discoveryUrl = fieldPresent(fields, 'discoveryUrl')
      ? string(fields.discoveryUrl).trim()
      : string(base.openIdConnectUrl)
    if (discoveryUrl) definition.openIdConnectUrl = discoveryUrl
    else delete definition.openIdConnectUrl
  } else if (type === 'oauth2') {
    const flows = fieldPresent(fields, 'flows')
      ? parseFlows(fields.flows)
      : objectOrEmpty(base.flows)
    if (flows && Object.keys(flows).length > 0) definition.flows = flows
    else delete definition.flows
  }
  return definition
}
