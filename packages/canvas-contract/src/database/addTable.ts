import { createNodeId, type CanvasNode, type JsonCanvas } from '../jsonCanvas'
import { deepEqual } from '../merge'
import { DEFAULT_ONTOLOGY, findEntityType } from '../ontology'
import type { TableColumn, TableDefinition } from './model'
import { stringifyTableDefinition } from './model'
import { placeNewDatabaseCards, estimateDatabaseSizes } from './layout'

export type DatabaseTableIdType = 'uuid' | 'bigint'

export interface AddDatabaseTableInput {
  name: string
  schema: string
  idType: DatabaseTableIdType
}

export function starterTableColumns(idType: DatabaseTableIdType): TableColumn[] {
  return [
    idType === 'uuid'
      ? {
        name: 'id',
        type: 'uuid',
        nullable: false,
        default: 'gen_random_uuid()',
      }
      : {
        name: 'id',
        type: 'bigint',
        nullable: false,
        identity: 'by_default',
      },
    {
      name: 'created_at',
      type: 'timestamp with time zone',
      nullable: false,
      default: 'now()',
    },
  ]
}

export function starterTableDefinition(idType: DatabaseTableIdType): TableDefinition {
  return {
    columns: starterTableColumns(idType),
    primaryKey: { columns: ['id'] },
    uniques: [],
    checks: [],
    foreignKeys: [],
    indexes: [],
  }
}

export function isStarterTableDefinition(definition: TableDefinition | undefined): boolean {
  if (!definition) return false
  return (['uuid', 'bigint'] as const).some((idType) => (
    deepEqual(definition.columns, starterTableColumns(idType))
  ))
}

export interface AddDatabaseTableResult {
  nodes: CanvasNode[]
  schemaUpdates: CanvasNode[]
  errors: string[]
}

function makeNode(entityType: string): CanvasNode {
  const definition = findEntityType(DEFAULT_ONTOLOGY, entityType)
  return {
    id: createNodeId(),
    type: 'text',
    x: 0,
    y: 0,
    width: definition?.defaultSize.width ?? 360,
    height: definition?.defaultSize.height ?? 240,
    text: '',
    app: { entityType, fields: {} },
  }
}

export function addDatabaseTable(
  canvas: JsonCanvas,
  input: AddDatabaseTableInput,
): AddDatabaseTableResult {
  const name = input.name.trim()
  const schema = input.schema.trim() || 'public'
  const errors: string[] = []
  if (!name) errors.push('Enter a table name.')
  if (!/^[a-z_][a-z0-9_$]*$/i.test(name)) errors.push('Use letters, digits, and underscores for the table name.')
  const duplicate = (canvas.nodes ?? []).some((node) => (
    node.app?.entityType === 'table'
    && String(node.app.fields?.name ?? '').trim() === name
    && String(node.app.fields?.schema ?? '').trim() === schema
  ))
  if (duplicate) errors.push(`Table "${schema}.${name}" already exists.`)
  if (errors.length > 0) return { nodes: [], schemaUpdates: [], errors }

  const definition = starterTableDefinition(input.idType)

  const additions: CanvasNode[] = []
  const schemaExists = (canvas.nodes ?? []).some((node) => (
    node.app?.entityType === 'db_schema'
    && String(node.app.fields?.name ?? '').trim() === schema
  ))
  if (!schemaExists) {
    const schemaNode = makeNode('db_schema')
    schemaNode.app = {
      entityType: 'db_schema',
      fields: { name: schema, description: '' },
    }
    additions.push(schemaNode)
  }

  const table = makeNode('table')
  table.app = {
    entityType: 'table',
    fields: {
      name,
      schema,
      description: '',
      status: 'active',
      definition: stringifyTableDefinition(definition),
    },
  }
  additions.push(table)

  const sizes = estimateDatabaseSizes({
    ...canvas,
    nodes: [...(canvas.nodes ?? []), ...additions],
  })
  const placed = placeNewDatabaseCards(canvas, additions, sizes)
  return {
    nodes: placed.nodes,
    schemaUpdates: placed.updates,
    errors: [],
  }
}
