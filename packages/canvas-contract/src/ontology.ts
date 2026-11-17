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
  content: z.boolean().optional(),
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

export const relationCategorySchema = z.enum([
  'structure',
  'runtime',
  'data',
  'access',
  'fallback',
  'annotation',
])

export const relationTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  color: z.string().min(1).optional(),
  category: relationCategorySchema.optional(),
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
  fields: z.record(z.string(), entityFieldValueSchema),
}).passthrough()

export const canvasLinkSchema = z.object({
  id: z.string().min(1),
  canvasId: z.string().min(1),
  label: z.string().trim().min(1).max(120).optional(),
})

export const canvasNodeMetaSchema = z.object({
  entityType: z.string().min(1).optional(),
  fields: z.record(z.string(), entityFieldValueSchema).optional(),
  groupMembers: z.array(z.string().min(1)).optional(),
  canvasLinks: z.array(canvasLinkSchema).optional(),
  inferred: z.boolean().optional(),
}).passthrough()

export const canvasEdgeMetaSchema = z.object({
  relationType: z.string().min(1).optional(),
  managed: z.boolean().optional(),
  status: z.string().min(1).optional(),
  mediaType: z.string().min(1).optional(),
  endpoint: z.string().min(1).optional(),
}).passthrough()

export type OntologyFieldType = z.infer<typeof ontologyFieldTypeSchema>
export type OntologyField = z.infer<typeof ontologyFieldSchema>
export type EntityTypeDefinition = z.infer<typeof entityTypeSchema>
export type RelationCategory = z.infer<typeof relationCategorySchema>
export type RelationTypeDefinition = z.infer<typeof relationTypeSchema>
export type Ontology = z.infer<typeof ontologySchema>
export type EntityFieldValue = z.infer<typeof entityFieldValueSchema>
export type CanvasEntityMeta = z.infer<typeof canvasEntityMetaSchema>
export type CanvasNodeMeta = z.infer<typeof canvasNodeMetaSchema>
export type CanvasLink = z.infer<typeof canvasLinkSchema>
export type CanvasEdgeMeta = z.infer<typeof canvasEdgeMetaSchema>

export type EntityFields = Record<string, EntityFieldValue>

export const DEFAULT_ONTOLOGY: Ontology = {
  version: '1.0',
  entityTypes: [    {
      id: 'repository',
      label: 'Repository',
      description: 'A source-code repository.',
      icon: 'folder-git',
      color: '5',
      defaultSize: { width: 360, height: 220 },
      relationTypes: ['uses', 'produces'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        {
          key: 'provider',
          label: 'Provider',
          type: 'select',
          options: ['github', 'gitlab', 'local', 'other'],
          defaultValue: 'github',
          required: true,
        },
        { key: 'url', label: 'URL', type: 'url' },
        { key: 'defaultBranch', label: 'Default branch', type: 'text', placeholder: 'main' },
        { key: 'owner', label: 'Owner', type: 'text' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['planned', 'active', 'deprecated'],
          defaultValue: 'active',
        },
      ],
    },
    {
      id: 'database',
      label: 'Database',
      description: 'A durable state boundary.',
      icon: 'database',
      color: '4',
      defaultSize: { width: 360, height: 240 },
      relationTypes: ['stores_in'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'purpose', label: 'Purpose', type: 'textarea' },
        {
          key: 'kind',
          label: 'Kind',
          type: 'select',
          options: ['relational', 'document', 'object', 'cache', 'search', 'warehouse'],
          defaultValue: 'relational',
          required: true,
        },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'consoleUrl', label: 'Console URL', type: 'url' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['planned', 'active', 'deprecated'],
          defaultValue: 'active',
        },
      ],
    },
    {
      id: 'service',
      label: 'Service',
      description: 'Legacy runtime service. Use System in Systems mode.',
      icon: 'server',
      color: '5',
      defaultSize: { width: 380, height: 280 },
      relationTypes: ['depends_on', 'calls', 'exposes'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'responsibility', label: 'Responsibility', type: 'textarea' },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'status', label: 'Status', type: 'select', options: ['planned', 'active', 'deprecated'] },
      ],
    },
    {
      id: 'api',
      label: 'API',
      description: 'A contract and access surface.',
      icon: 'cable',
      color: '6',
      defaultSize: { width: 360, height: 240 },
      relationTypes: ['exposes', 'calls'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'purpose', label: 'Purpose', type: 'textarea' },
        {
          key: 'protocol',
          label: 'Protocol',
          type: 'select',
          options: ['http', 'graphql', 'grpc', 'event', 'webhook', 'cli'],
          defaultValue: 'http',
          required: true,
        },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'docsUrl', label: 'Docs URL', type: 'url' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['planned', 'active', 'deprecated'],
          defaultValue: 'active',
        },
      ],
    },
    {
      id: 'decision',
      label: 'Decision',
      description: 'A recorded choice and its rationale.',
      icon: 'scale',
      color: '3',
      defaultSize: { width: 380, height: 240 },
      relationTypes: ['relates_to'],
      fields: [
        { key: 'title', label: 'Title', type: 'text', primary: true, required: true },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['proposed', 'accepted', 'rejected', 'superseded'],
          defaultValue: 'proposed',
        },
        { key: 'rationale', label: 'Rationale', type: 'textarea' },
        { key: 'owner', label: 'Owner', type: 'text' },
      ],
    },
    {
      id: 'risk',
      label: 'Risk',
      description: 'A known operational or delivery risk.',
      icon: 'triangle-alert',
      color: '1',
      defaultSize: { width: 380, height: 240 },
      relationTypes: ['relates_to'],
      fields: [
        { key: 'title', label: 'Title', type: 'text', primary: true, required: true },
        {
          key: 'severity',
          label: 'Severity',
          type: 'select',
          options: ['low', 'medium', 'high', 'critical'],
          defaultValue: 'medium',
          required: true,
        },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'mitigation', label: 'Mitigation', type: 'textarea' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['open', 'mitigated', 'accepted', 'closed'],
          defaultValue: 'open',
        },
      ],
    },
    {
      id: 'actor',
      label: 'Actor',
      description: 'A human, role, or team that performs or owns work.',
      icon: 'user-round',
      color: '2',
      defaultSize: { width: 320, height: 200 },
      relationTypes: ['runs'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        {
          key: 'kind',
          label: 'Kind',
          type: 'select',
          options: ['person', 'role', 'team'],
          defaultValue: 'person',
          required: true,
        },
        { key: 'responsibility', label: 'Responsibility', type: 'textarea' },
      ],
    },
    {
      id: 'system',
      label: 'System',
      description: 'A runtime system, API surface, database, CLI, or worker.',
      icon: 'boxes',
      color: '5',
      defaultSize: { width: 380, height: 260 },
      relationTypes: ['runs', 'uses', 'produces', 'defines', 'describes'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'purpose', label: 'Purpose', type: 'textarea' },
        {
          key: 'kind',
          label: 'Kind',
          type: 'select',
          options: ['service', 'api', 'database', 'cli', 'worker'],
          defaultValue: 'service',
          required: true,
        },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'deploymentUrl', label: 'Deployment URL', type: 'url' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['planned', 'active', 'deprecated'],
          defaultValue: 'planned',
        },
      ],
    },
    {
      id: 'queue',
      label: 'Queue / Topic',
      description: 'Asynchronous transport between services.',
      icon: 'list',
      color: '3',
      defaultSize: { width: 360, height: 240 },
      relationTypes: ['carries'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        {
          key: 'kind',
          label: 'Kind',
          type: 'select',
          options: ['queue', 'topic', 'stream'],
          defaultValue: 'queue',
          required: true,
        },
        {
          key: 'delivery',
          label: 'Delivery',
          type: 'select',
          options: ['at_most_once', 'at_least_once', 'exactly_once'],
          defaultValue: 'at_least_once',
        },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
    {
      id: 'event',
      label: 'Event',
      description: 'A named domain event or message contract.',
      icon: 'zap',
      color: '2',
      defaultSize: { width: 360, height: 240 },
      relationTypes: ['carries', 'consumes', 'emits', 'handles'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'version', label: 'Version', type: 'text', placeholder: 'v1', required: true },
        { key: 'schemaUrl', label: 'Schema URL', type: 'url' },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
    {
      id: 'external_system',
      label: 'External system',
      description: 'A vendor, identity provider, or third-party dependency.',
      icon: 'cloud',
      color: '2',
      defaultSize: { width: 380, height: 240 },
      relationTypes: ['calls', 'depends_on', 'authenticates_via'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'vendor', label: 'Vendor', type: 'text' },
        { key: 'purpose', label: 'Purpose', type: 'textarea' },
        { key: 'contractUrl', label: 'Contract URL', type: 'url' },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
    {
      id: 'requirement',
      label: 'Requirement',
      description: 'A constraint, acceptance criterion, or quality goal.',
      icon: 'file-check',
      color: '3',
      defaultSize: { width: 380, height: 260 },
      relationTypes: ['relates_to'],
      fields: [
        { key: 'title', label: 'Title', type: 'text', primary: true, required: true },
        {
          key: 'priority',
          label: 'Priority',
          type: 'select',
          options: ['must', 'should', 'could'],
          defaultValue: 'should',
        },
        { key: 'acceptance', label: 'Acceptance', type: 'textarea' },
        { key: 'owner', label: 'Owner', type: 'text' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['open', 'accepted', 'done'],
          defaultValue: 'open',
        },
      ],
    },    {
      id: 'process',
      label: 'Process',
      description: 'Manual, automated, or hybrid coordination.',
      icon: 'workflow',
      color: '3',
      defaultSize: { width: 380, height: 260 },
      relationTypes: ['runs', 'orchestrates', 'uses'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'purpose', label: 'Purpose', type: 'textarea' },
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          options: ['manual', 'automated', 'hybrid'],
          defaultValue: 'manual',
          required: true,
        },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'runbookUrl', label: 'Runbook URL', type: 'url' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['planned', 'active', 'deprecated'],
          defaultValue: 'planned',
        },
      ],
    },
    {
      id: 'artifact',
      label: 'Artifact',
      description: 'A versioned deliverable such as a manifest, image, model, schema, or dataset.',
      icon: 'package',
      color: '6',
      defaultSize: { width: 360, height: 260 },
      relationTypes: ['produces', 'uses'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        {
          key: 'kind',
          label: 'Kind',
          type: 'select',
          options: ['manifest', 'container', 'model', 'config', 'schema', 'dataset', 'document'],
          defaultValue: 'manifest',
          required: true,
        },
        { key: 'version', label: 'Version', type: 'text' },
        { key: 'uri', label: 'URI', type: 'url' },
        { key: 'digest', label: 'Digest', type: 'text' },
        { key: 'owner', label: 'Owner', type: 'text' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['draft', 'published', 'deprecated'],
          defaultValue: 'draft',
        },
        {
          key: 'schemaMode',
          label: 'Schema mode',
          type: 'select',
          options: ['none', 'inline', 'shared'],
          defaultValue: 'none',
          content: true,
        },
        {
          key: 'schema',
          label: 'Schema',
          type: 'text',
          content: true,
          placeholder: 'JSON Schema source',
        },
        { key: 'schemaRef', label: 'Shared schema', type: 'text', content: true },
      ],
    },
    {
      id: 'api_definition',
      label: 'API',
      description: 'One OpenAPI 3.1 service definition.',
      icon: 'cable',
      color: '6',
      defaultSize: { width: 420, height: 300 },
      relationTypes: ['contains', 'authenticates_via', 'relates_to'],
      fields: [
        { key: 'title', label: 'Title', type: 'text', primary: true, required: true, defaultValue: 'API' },
        { key: 'version', label: 'Version', type: 'text', required: true, defaultValue: '1.0.0' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'servers', label: 'Servers', type: 'textarea', placeholder: 'One URL per line' },
        { key: 'owner', label: 'Owner', type: 'text' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['planned', 'active', 'deprecated'],
          defaultValue: 'active',
        },
        {
          key: 'reviewStatus',
          label: 'Review status',
          type: 'select',
          options: ['needs_review', 'approved', 'changes_requested'],
          defaultValue: 'needs_review',
        },
        { key: 'reviewedVersion', label: 'Reviewed version', type: 'text', placeholder: '1.0.0' },
        { key: 'lastReviewed', label: 'Last reviewed', type: 'text', placeholder: 'YYYY-MM-DD' },
        { key: 'reviewIntervalDays', label: 'Review interval (days)', type: 'number', defaultValue: 90 },
        { key: 'extra', label: 'Extra', type: 'textarea', placeholder: '{}' },
      ],
    },
    {
      id: 'resource',
      label: 'Resource',
      description: 'A business resource that groups API endpoints.',
      icon: 'boxes',
      color: '3',
      defaultSize: { width: 320, height: 200 },
      relationTypes: ['contains', 'authenticates_via', 'relates_to'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'owner', label: 'Owner', type: 'text' },
      ],
    },
    {
      id: 'endpoint',
      label: 'Endpoint',
      description: 'One HTTP method and path with its OpenAPI Operation object.',
      icon: 'workflow',
      color: '2',
      defaultSize: { width: 360, height: 220 },
      relationTypes: ['accepts', 'returns', 'authenticates_via', 'relates_to'],
      fields: [
        {
          key: 'method',
          label: 'Method',
          type: 'select',
          options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'],
          defaultValue: 'GET',
          required: true,
        },
        { key: 'path', label: 'Path', type: 'text', primary: true, required: true, placeholder: '/v1/resources' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['planned', 'active', 'deprecated'],
          defaultValue: 'active',
        },
        { key: 'operation', label: 'Operation', type: 'textarea', required: true, placeholder: '{}' },
      ],
    },
    {
      id: 'security_scheme',
      label: 'Security',
      description: 'One OpenAPI security scheme.',
      icon: 'shield',
      color: '4',
      defaultSize: { width: 360, height: 260 },
      relationTypes: ['authenticates_via', 'relates_to'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        {
          key: 'type',
          label: 'Type',
          type: 'select',
          options: ['http', 'apiKey', 'oauth2', 'openIdConnect', 'mutualTLS'],
          defaultValue: 'http',
          required: true,
        },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'scheme', label: 'Scheme', type: 'select', options: ['bearer', 'basic'] },
        { key: 'bearerFormat', label: 'Bearer format', type: 'text' },
        { key: 'in', label: 'In', type: 'select', options: ['header', 'query', 'cookie'] },
        { key: 'parameterName', label: 'Parameter name', type: 'text' },
        { key: 'discoveryUrl', label: 'Discovery URL', type: 'url' },
        { key: 'flows', label: 'Flows', type: 'textarea' },
        { key: 'definition', label: 'Definition', type: 'textarea', required: true, placeholder: '{}' },
      ],
    },
    {
      id: 'schema',
      label: 'Schema',
      description: 'A versioned JSON Schema contract shared across systems.',
      icon: 'braces',
      color: '3',
      defaultSize: { width: 560, height: 420 },
      relationTypes: ['defines', 'describes', 'uses', 'references', 'relates_to'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true },
        {
          key: 'kind',
          label: 'Contract kind',
          type: 'select',
          options: ['api', 'database', 'event', 'config', 'dataset', 'other'],
          defaultValue: 'api',
          required: true,
        },
        { key: 'version', label: 'Version', type: 'text', required: true, placeholder: '1.0.0', defaultValue: '1.0.0' },
        { key: 'owner', label: 'Owner', type: 'text' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: ['draft', 'active', 'deprecated'],
          defaultValue: 'draft',
        },
        {
          key: 'reviewStatus',
          label: 'Review status',
          type: 'select',
          options: ['needs_review', 'approved', 'changes_requested'],
          defaultValue: 'needs_review',
        },
        { key: 'reviewedVersion', label: 'Reviewed version', type: 'text', placeholder: '1.0.0' },
        { key: 'lastReviewed', label: 'Last reviewed', type: 'text', placeholder: 'YYYY-MM-DD' },
        { key: 'reviewIntervalDays', label: 'Review interval (days)', type: 'number', defaultValue: 90 },
        {
          key: 'source',
          label: 'JSON Schema',
          type: 'textarea',
          content: true,
          placeholder: 'Paste a JSON Schema document.',
          defaultValue: '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "title": "New contract",\n  "type": "object",\n  "properties": {},\n  "required": []\n}\n',
        },
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
    },    {
      id: 'note',
      label: 'Note',
      description: 'Free Markdown context.',
      icon: 'sticky-note',
      color: '2',
      defaultSize: { width: 340, height: 220 },
      relationTypes: ['relates_to'],
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true, required: true, defaultValue: 'Note' },
        { key: 'body', label: 'Note', type: 'textarea' },
      ],
    },
  ],
  relationTypes: [
    { id: 'relates_to', label: 'relates to', category: 'annotation', directed: false },
    { id: 'depends_on', label: 'depends on', color: '2', category: 'fallback', directed: true },
    { id: 'owns', label: 'owns', color: '4', category: 'structure', directed: true },
    { id: 'calls', label: 'calls', color: '5', category: 'runtime', directed: true },
    { id: 'reads_from', label: 'reads from', color: '5', category: 'data', directed: true },
    { id: 'writes_to', label: 'writes to', color: '6', category: 'data', directed: true },
    { id: 'deploys_to', label: 'deploys to', color: '3', category: 'structure', directed: true },
    { id: 'implements', label: 'implements', color: '4', category: 'structure', directed: true },
    { id: 'contains', label: 'contains', color: '6', category: 'structure', directed: true },
    { id: 'accepts', label: 'accepts', color: '2', category: 'data', directed: true },
    { id: 'returns', label: 'returns', color: '3', category: 'data', directed: true },
    { id: 'exposes', label: 'exposes', color: '6', category: 'structure', directed: true },
    { id: 'publishes', label: 'publishes', color: '3', category: 'runtime', directed: true },
    { id: 'consumes', label: 'consumes', color: '3', category: 'runtime', directed: true },
    { id: 'carries', label: 'carries', color: '2', category: 'data', directed: true },
    { id: 'emits', label: 'emits', color: '2', category: 'data', directed: true },
    { id: 'handles', label: 'handles', color: '2', category: 'data', directed: true },
    { id: 'authenticates_via', label: 'authenticates via', color: '4', category: 'access', directed: true },
    { id: 'stores_in', label: 'stores in', color: '6', category: 'data', directed: true },
    { id: 'runs', label: 'runs', color: '3', category: 'runtime', directed: true },
    { id: 'orchestrates', label: 'orchestrates', color: '3', category: 'runtime', directed: true },
    { id: 'produces', label: 'produces', color: '6', category: 'data', directed: true },
    { id: 'uses', label: 'uses', color: '2', category: 'data', directed: true },
    { id: 'defines', label: 'defines', color: '4', category: 'structure', directed: true },
    { id: 'describes', label: 'describes', color: '3', category: 'data', directed: true },
    { id: 'references', label: 'references', color: '2', category: 'data', directed: true },
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
  const titleField = entityType.fields.find((field) => field.key === 'title')
  const primary = titleField ?? entityType.fields.find((field) => field.primary) ?? entityType.fields[0]
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
    if (field.primary || field.content) continue
    const value = fields[field.key]
    const text = value == null ? '' : String(value).trim()
    if (!text) continue
    lines.push(`- **${field.label}:** ${text}`)
  }
  return lines.join('\n')
}

export function getEntityMeta(node: { app?: unknown }): CanvasEntityMeta | undefined {
  const parsed = canvasEntityMetaSchema.safeParse(node.app)
  return parsed.success ? parsed.data : undefined
}

export function getCanvasLinks(node: { app?: unknown }): CanvasLink[] {
  const parsed = canvasNodeMetaSchema.safeParse(node.app)
  return parsed.success ? parsed.data.canvasLinks ?? [] : []
}

export function getGroupMembers(node: { app?: unknown }): string[] | undefined {
  const parsed = canvasNodeMetaSchema.safeParse(node.app)
  return parsed.success ? parsed.data.groupMembers : undefined
}

export function getEdgeMeta(edge: { app?: unknown }): CanvasEdgeMeta | undefined {
  const parsed = canvasEdgeMetaSchema.safeParse(edge.app)
  return parsed.success ? parsed.data : undefined
}
