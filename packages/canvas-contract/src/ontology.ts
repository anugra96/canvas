import { z } from 'zod'

export const ontologyFieldTypeSchema = z.enum([
  'text',
  'textarea',
  'url',
  'select',
  'number',
])

export const ontologyFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: ontologyFieldTypeSchema,
  placeholder: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().optional(),
  primary: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number()]).optional(),
})

export const entityTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().min(1),
  color: z.string().min(1).optional(),
  defaultSize: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  fields: z.array(ontologyFieldSchema).min(1),
  relationTypes: z.array(z.string().min(1)).optional(),
})

export const relationTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  color: z.string().min(1).optional(),
  directed: z.boolean().optional(),
})

export const ontologySchema = z.object({
  version: z.string().min(1),
  entityTypes: z.array(entityTypeSchema).min(1),
  relationTypes: z.array(relationTypeSchema),
})

export const entityFieldValueSchema = z.union([z.string(), z.number(), z.null()])

export const canvasEntityMetaSchema = z.object({
  entityType: z.string().min(1),
  fields: z.record(entityFieldValueSchema),
}).passthrough()

export const canvasNodeMetaSchema = z.object({
  entityType: z.string().min(1).optional(),
  fields: z.record(entityFieldValueSchema).optional(),
  groupMembers: z.array(z.string().min(1)).optional(),
}).passthrough()

export const canvasEdgeMetaSchema = z.object({
  relationType: z.string().min(1).optional(),
}).passthrough()

export type OntologyFieldType = z.infer<typeof ontologyFieldTypeSchema>
export type OntologyField = z.infer<typeof ontologyFieldSchema>
export type EntityTypeDefinition = z.infer<typeof entityTypeSchema>
export type RelationTypeDefinition = z.infer<typeof relationTypeSchema>
export type Ontology = z.infer<typeof ontologySchema>
export type EntityFieldValue = z.infer<typeof entityFieldValueSchema>
export type CanvasEntityMeta = z.infer<typeof canvasEntityMetaSchema>
export type CanvasNodeMeta = z.infer<typeof canvasNodeMetaSchema>
export type CanvasEdgeMeta = z.infer<typeof canvasEdgeMetaSchema>

export type EntityFields = Record<string, EntityFieldValue>

export const DEFAULT_ONTOLOGY: Ontology = {
  version: '1.0',
  entityTypes: [
    {
      id: 'repository',
      label: 'Repository',
      description: 'A source repository that a team owns.',
      icon: 'boxes',
      color: '5',
      defaultSize: { width: 380, height: 280 },
      relationTypes: ['owns', 'depends_on', 'deploys_to'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'owner', label: 'Owner', type: 'text', placeholder: 'Team or person' },
        { key: 'url', label: 'URL', type: 'url', placeholder: 'https://github.com/...' },
        { key: 'language', label: 'Language', type: 'text' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['active', 'maintenance', 'archived'],
          defaultValue: 'active',
        },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
    {
      id: 'database',
      label: 'Database',
      description: 'A durable data store and its environment.',
      icon: 'database',
      color: '4',
      defaultSize: { width: 380, height: 280 },
      relationTypes: ['depends_on', 'reads_from', 'writes_to'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'engine', label: 'Engine', type: 'text', placeholder: 'Postgres, DynamoDB' },
        {
          key: 'environment',
          label: 'Environment',
          type: 'select',
          options: ['production', 'staging', 'development'],
          defaultValue: 'production',
        },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
    {
      id: 'service',
      label: 'Service',
      description: 'A running backend, worker, or deployed system.',
      icon: 'server',
      color: '5',
      defaultSize: { width: 380, height: 280 },
      relationTypes: ['owns', 'depends_on', 'calls', 'deploys_to'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'runtime', label: 'Runtime', type: 'text', placeholder: 'ECS, Lambda' },
        { key: 'repo', label: 'Repository', type: 'text' },
        { key: 'healthUrl', label: 'Health URL', type: 'url' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['healthy', 'degraded', 'down', 'planned'],
          defaultValue: 'healthy',
        },
      ],
    },
    {
      id: 'api',
      label: 'API',
      description: 'A public or internal interface between systems.',
      icon: 'plug',
      color: '6',
      defaultSize: { width: 380, height: 260 },
      relationTypes: ['owns', 'calls', 'depends_on'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'baseUrl', label: 'Base URL', type: 'url' },
        { key: 'auth', label: 'Auth', type: 'text', placeholder: 'Cognito, API key' },
        { key: 'docsUrl', label: 'Docs URL', type: 'url' },
      ],
    },
    {
      id: 'decision',
      label: 'Decision',
      description: 'A recorded choice, status, and rationale.',
      icon: 'git-branch',
      color: '3',
      defaultSize: { width: 400, height: 280 },
      relationTypes: ['relates_to', 'depends_on'],
      fields: [
        { key: 'title', label: 'Title', type: 'text', primary: true, required: true },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['proposed', 'accepted', 'rejected', 'superseded'],
          defaultValue: 'proposed',
        },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'date', label: 'Date', type: 'text', placeholder: 'YYYY-MM-DD' },
        { key: 'rationale', label: 'Rationale', type: 'textarea' },
      ],
    },
    {
      id: 'risk',
      label: 'Risk',
      description: 'A known operational or delivery risk.',
      icon: 'alert-triangle',
      color: '1',
      defaultSize: { width: 380, height: 280 },
      relationTypes: ['relates_to', 'depends_on'],
      fields: [
        { key: 'title', label: 'Title', type: 'text', primary: true, required: true },
        {
          key: 'severity',
          label: 'Severity',
          type: 'select',
          options: ['low', 'medium', 'high', 'critical'],
          defaultValue: 'medium',
        },
        {
          key: 'likelihood',
          label: 'Likelihood',
          type: 'select',
          options: ['low', 'medium', 'high'],
          defaultValue: 'medium',
        },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'mitigation', label: 'Mitigation', type: 'textarea' },
      ],
    },
    {
      id: 'code',
      label: 'Code',
      description: 'A syntax-highlighted code sample with a language and notes.',
      icon: 'code',
      color: '6',
      defaultSize: { width: 560, height: 360 },
      relationTypes: ['relates_to', 'depends_on', 'implements'],
      fields: [
        { key: 'title', label: 'Title', type: 'text', primary: true, placeholder: 'What this code does' },
        {
          key: 'language',
          label: 'Language',
          type: 'select',
          options: [
            'typescript',
            'javascript',
            'tsx',
            'jsx',
            'python',
            'json',
            'sql',
            'yaml',
            'go',
            'rust',
            'cpp',
            'css',
            'html',
            'markdown',
            'text',
          ],
          defaultValue: 'typescript',
        },
        { key: 'code', label: 'Code', type: 'textarea', placeholder: 'Paste a code sample' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
    {
      id: 'note',
      label: 'Note',
      description: 'A general structured note.',
      icon: 'sticky-note',
      color: '2',
      defaultSize: { width: 360, height: 220 },
      relationTypes: ['relates_to'],
      fields: [
        { key: 'title', label: 'Title', type: 'text', primary: true },
        { key: 'body', label: 'Body', type: 'textarea' },
      ],
    },
  ],
  relationTypes: [
    { id: 'relates_to', label: 'relates to', directed: false },
    { id: 'depends_on', label: 'depends on', color: '2', directed: true },
    { id: 'owns', label: 'owns', color: '4', directed: true },
    { id: 'calls', label: 'calls', color: '5', directed: true },
    { id: 'reads_from', label: 'reads from', color: '5', directed: true },
    { id: 'writes_to', label: 'writes to', color: '6', directed: true },
    { id: 'deploys_to', label: 'deploys to', color: '3', directed: true },
    { id: 'implements', label: 'implements', color: '4', directed: true },
  ],
}

export function findEntityType(
  ontology: Ontology,
  entityTypeId: string,
): EntityTypeDefinition | undefined {
  return ontology.entityTypes.find((entityType) => entityType.id === entityTypeId)
}

export function findRelationType(
  ontology: Ontology,
  relationTypeId: string,
): RelationTypeDefinition | undefined {
  return ontology.relationTypes.find((relationType) => relationType.id === relationTypeId)
}

export function emptyEntityFields(entityType: EntityTypeDefinition): EntityFields {
  return Object.fromEntries(
    entityType.fields.map((field) => [field.key, field.defaultValue ?? '']),
  )
}

export function entityTitle(
  entityType: EntityTypeDefinition,
  fields: EntityFields,
): string {
  const primary = entityType.fields.find((field) => field.primary) ?? entityType.fields[0]
  const value = primary ? fields[primary.key] : ''
  return value == null ? '' : String(value)
}

export function renderEntityMarkdown(
  entityType: EntityTypeDefinition,
  fields: EntityFields,
): string {
  const title = entityTitle(entityType, fields).trim() || `Untitled ${entityType.label.toLowerCase()}`
  const lines = [`## ${entityType.label}: ${title}`]
  for (const field of entityType.fields) {
    if (field.primary) continue
    const value = fields[field.key]
    const text = value == null ? '' : String(value).trim()
    if (!text) continue
    lines.push(`- **${field.label}:** ${text}`)
  }
  return lines.join('\n')
}

export function getEntityMeta(node: { skyward?: unknown }): CanvasEntityMeta | undefined {
  const parsed = canvasEntityMetaSchema.safeParse(node.skyward)
  return parsed.success ? parsed.data : undefined
}

export function getGroupMembers(node: { skyward?: unknown }): string[] | undefined {
  const parsed = canvasNodeMetaSchema.safeParse(node.skyward)
  return parsed.success ? parsed.data.groupMembers : undefined
}

export function getEdgeMeta(edge: { skyward?: unknown }): CanvasEdgeMeta | undefined {
  const parsed = canvasEdgeMetaSchema.safeParse(edge.skyward)
  return parsed.success ? parsed.data : undefined
}
