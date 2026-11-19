import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { exportOpenApiCanvas } from './exportOpenApi'
import { parseOpenApiSource, sortKeys } from './document'
import { importOpenApi } from './importOpenApi'

const engineSource = readFileSync(new URL('./fixtures/skyward-engine-v1.json', import.meta.url), 'utf8')
const alaskaSource = readFileSync(new URL('./fixtures/openapi-alaska.yaml', import.meta.url), 'utf8')

const synthetic = {
  openapi: '3.1.0',
  info: {
    title: 'Synthetic API',
    version: '2.3.4',
    description: 'Every supported feature.',
    termsOfService: 'https://example.com/terms',
    contact: { name: 'API Team', email: 'api@example.com' },
    license: { name: 'MIT' },
    'x-info-extension': true,
  },
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
  servers: [
    {
      url: 'https://api.example.com/{version}',
      description: 'Production',
      variables: { version: { default: 'v1' } },
    },
  ],
  tags: [
    {
      name: 'Jobs',
      description: 'Job resources.',
      externalDocs: { url: 'https://docs.example.com/jobs' },
      'x-tag-extension': 'jobs',
    },
    { name: 'Health', description: 'Health checks.' },
  ],
  security: [{ BearerAuth: [] }],
  paths: {
    '/v1/jobs': {
      get: {
        tags: ['Jobs', 'Read'],
        summary: 'List jobs',
        operationId: 'listJobs',
        parameters: [
          { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Job list',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/JobList' } },
            },
          },
        },
        security: [{ ApiKeyAuth: [] }],
        'x-operation-extension': 'list',
      },
      post: {
        tags: ['Jobs'],
        summary: 'Create job',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/JobCreate' } },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Job' } },
            },
          },
          '422': {
            description: 'Invalid',
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
            },
          },
        },
      },
    },
    '/healthz': {
      get: {
        summary: 'Health',
        deprecated: false,
        responses: { '200': { description: 'Healthy' } },
        security: [],
      },
    },
  },
  webhooks: {
    jobFinished: {
      post: {
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Job' } },
          },
        },
        responses: { '204': { description: 'Accepted' } },
      },
    },
  },
  components: {
    schemas: {
      Job: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      JobCreate: {
        type: 'object',
        properties: { job: { $ref: '#/components/schemas/Job' } },
      },
      JobList: {
        type: 'array',
        items: { $ref: '#/components/schemas/Job' },
      },
      Problem: {
        type: 'object',
        properties: { detail: { type: 'string' } },
      },
    },
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer' },
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    },
    headers: {
      RequestId: { schema: { type: 'string' } },
    },
    parameters: {
      Trace: { in: 'header', name: 'x-trace', schema: { type: 'string' } },
    },
    responses: {
      NotFound: { description: 'Not found' },
    },
  },
  'x-root-extension': { enabled: true },
}

describe('OpenAPI import/export round trip', () => {
  it.each([
    { name: 'Skyward Engine JSON', source: engineSource },
    { name: 'Alaska YAML', source: alaskaSource },
    { name: 'synthetic every-feature document', source: synthetic },
  ])('$name', ({ source }) => {
    const original = parseOpenApiSource(source).document
    const imported = importOpenApi(source)
    const exported = exportOpenApiCanvas(imported.canvas)
    expect(sortKeys(exported)).toEqual(sortKeys(original))
  })

  it('keeps top-level security from YAML', () => {
    const source = `openapi: 3.1.0
info:
  title: Secure API
  version: 1.0.0
security:
  - BearerAuth: []
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
paths:
  /tasks:
    get:
      summary: List tasks
      responses:
        '200':
          description: OK
`
    const original = parseOpenApiSource(source).document
    const imported = importOpenApi(source)
    const exported = exportOpenApiCanvas(imported.canvas)
    expect(sortKeys(exported)).toEqual(sortKeys(original))
  })
})
