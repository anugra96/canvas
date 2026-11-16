import { isObject, objectOrEmpty } from './document'
import type { JsonObject } from './types'

export interface CurlSnippetInput {
  method: string
  path: string
  operation: JsonObject
  servers: string[]
  globalSecurity: string[]
  securitySchemes: Record<string, JsonObject>
}

function shell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function parameterExample(parameter: JsonObject): string {
  if ('example' in parameter) return String(parameter.example)
  const named = objectOrEmpty(parameter.examples)
  const first = Object.values(named)[0]
  if (isObject(first) && 'value' in first) return String(first.value)
  return `<${String(parameter.name ?? 'value')}>`
}

function bodyFor(operation: JsonObject): { mediaType: string; data: string } | undefined {
  const content = objectOrEmpty(objectOrEmpty(operation.requestBody).content)
  for (const [mediaType, media] of Object.entries(content)) {
    const value = objectOrEmpty(media)
    if ('example' in value) return { mediaType, data: JSON.stringify(value.example) }
    const examples = objectOrEmpty(value.examples)
    const first = Object.values(examples)[0]
    if (isObject(first) && 'value' in first) return { mediaType, data: JSON.stringify(first.value) }
  }
  return undefined
}

function authHeaders(input: CurlSnippetInput, operation: JsonObject): string[] {
  const requirements = Array.isArray(operation.security)
    ? operation.security
    : input.globalSecurity.map((name) => ({ [name]: [] as string[] }))
  const headers: string[] = []
  for (const requirement of requirements) {
    if (!isObject(requirement)) continue
    for (const name of Object.keys(requirement)) {
      const scheme = input.securitySchemes[name]
      if (!scheme) continue
      if (scheme.type === 'http' && String(scheme.scheme).toLowerCase() === 'bearer') {
        headers.push("Authorization: Bearer $TOKEN")
      } else if (scheme.type === 'apiKey' && scheme.in === 'header') {
        headers.push(`${String(scheme.name || name)}: $API_KEY`)
      }
    }
  }
  return headers
}

export function buildCurlSnippet(input: CurlSnippetInput): string {
  const parameters = Array.isArray(input.operation.parameters)
    ? input.operation.parameters.filter(isObject)
    : []
  let path = input.path
  for (const parameter of parameters) {
    if (parameter.in !== 'path') continue
    path = path.replaceAll(`{${String(parameter.name)}}`, parameterExample(parameter))
  }
  path = path.replace(/\{([^}]+)\}/g, '<$1>')
  const query = parameters
    .filter((parameter) => parameter.in === 'query' && parameter.required === true)
    .map((parameter) => `${encodeURIComponent(String(parameter.name))}=${encodeURIComponent(parameterExample(parameter))}`)
  const queryString = query.length > 0 ? `?${query.join('&')}` : ''
  const server = input.servers[0] ?? ''
  const url = `${server.replace(/\/$/, '')}${path}${queryString}`
  const headers = authHeaders(input, input.operation)
  const body = bodyFor(input.operation)
  if (body) headers.push(`Content-Type: ${body.mediaType}`)
  const lines = [`curl -X ${input.method.toUpperCase()} ${shell(url)}`]
  for (const header of headers) lines.push(`  -H ${shell(header)}`)
  if (body) lines.push(`  --data ${shell(body.data)}`)
  return lines.join(' \\\n')
}
