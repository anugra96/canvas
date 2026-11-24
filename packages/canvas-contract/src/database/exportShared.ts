import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { getEntityMeta } from '../ontology'
import type { TableDefinition } from './model'
import { nodeTableDefinition, schemaName, stringField } from './model'

export function databaseNodeType(node: CanvasNode): string {
  return getEntityMeta(node)?.entityType ?? ''
}

export function databaseDefinition(canvas: Pick<JsonCanvas, 'nodes'>): CanvasNode | undefined {
  return (canvas.nodes ?? []).find((node) => databaseNodeType(node) === 'database_definition')
}

export function databaseTables(canvas: Pick<JsonCanvas, 'nodes'>): CanvasNode[] {
  return (canvas.nodes ?? [])
    .filter((node) => databaseNodeType(node) === 'table')
    .sort((left, right) =>
      schemaName(left).localeCompare(schemaName(right))
      || stringField(left, 'name').localeCompare(stringField(right, 'name')))
}

export function databaseEnums(canvas: Pick<JsonCanvas, 'nodes'>): CanvasNode[] {
  return (canvas.nodes ?? [])
    .filter((node) => databaseNodeType(node) === 'db_enum')
    .sort((left, right) =>
      schemaName(left).localeCompare(schemaName(right))
      || stringField(left, 'name').localeCompare(stringField(right, 'name')))
}

export function databaseSchemas(
  canvas: Pick<JsonCanvas, 'nodes'>,
): Array<{ name: string; description: string }> {
  const names = new Map<string, string>()
  for (const node of canvas.nodes ?? []) {
    if (databaseNodeType(node) === 'db_schema') {
      names.set(stringField(node, 'name'), stringField(node, 'description'))
    }
  }
  for (const node of canvas.nodes ?? []) {
    if (databaseNodeType(node) === 'table' || databaseNodeType(node) === 'db_enum') {
      const name = schemaName(node)
      if (!names.has(name)) names.set(name, '')
    }
  }
  return [...names.entries()]
    .filter(([name]) => name.trim() !== '')
    .map(([name, description]) => ({ name, description }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function enumValues(node: CanvasNode): string[] {
  return stringField(node, 'values')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
}

export interface DatabaseTable {
  node: CanvasNode
  schema: string
  name: string
  definition: TableDefinition
}

export function databaseTableDefinitions(
  canvas: Pick<JsonCanvas, 'nodes'>,
): DatabaseTable[] {
  return databaseTables(canvas).flatMap((node) => {
    const name = stringField(node, 'name')
    if (!name) return []
    const definition = nodeTableDefinition(node)
    if (!definition) {
      throw new Error(`Table "${schemaName(node)}.${name}" has an invalid Definition.`)
    }
    return [{ node, schema: schemaName(node), name, definition }]
  })
}

export function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
