import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { withCanvasDatabaseTarget } from '../databaseTarget'
import { exportDatabaseDdl } from './exportDatabase'
import { importDatabaseSql } from './importDatabase'
import {
  stringifyTableDefinition,
  type TableDefinition,
} from './model'
import { sqliteColumnTypePlan } from './targets/sqlite'

const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve('libpg-query/wasm/libpg-query.wasm'))

const fixtures = [
  'auth-better-auth.sql',
  'order-erd.sql',
  'pg-dump-synthetic.sql',
] as const

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

function entityNode(
  id: string,
  entityType: string,
  fields: Record<string, string>,
): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    text: '',
    app: { entityType, fields },
  }
}

function tableNode(
  id: string,
  name: string,
  schema: string,
  definition: TableDefinition,
): CanvasNode {
  return entityNode(id, 'table', {
    name,
    schema,
    description: '',
    status: 'active',
    definition: stringifyTableDefinition(definition),
  })
}

function enumNode(id: string, name: string, schema: string, values: string[]): CanvasNode {
  return entityNode(id, 'db_enum', {
    name,
    schema,
    description: '',
    values: values.join('\n'),
  })
}

function databaseNode(id: string): CanvasNode {
  return entityNode(id, 'database_definition', {
    name: 'SQLite proof',
    version: '',
    description: '',
    owner: '',
    extensions: 'pgcrypto public',
    extra: 'CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;',
  })
}

function smallCanvas(): JsonCanvas {
  const users: TableDefinition = {
    columns: [
      { name: 'id', type: 'bigint', nullable: false, identity: 'by_default' },
      { name: 'email', type: 'varchar(3)', nullable: false },
      { name: 'active', type: 'boolean', nullable: false, default: 'true' },
      { name: 'payload', type: 'json', nullable: false },
      { name: 'status', type: 'public.mood', nullable: false, default: "'active'" },
      { name: 'created_at', type: 'timestamp', nullable: false, default: 'now()' },
      { name: 'token', type: 'text', nullable: true, default: 'gen_random_uuid()' },
      { name: 'import_ref', type: 'integer', nullable: true, identity: 'by_default' },
      { name: 'email_upper', type: 'text', nullable: true, generated: 'lower(email)' },
    ],
    primaryKey: { name: 'users_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      { name: 'users_created_cast', expression: "created_at::text <> ''" },
      { name: 'users_email_ok', expression: 'length(email) > 0' },
    ],
    foreignKeys: [],
    indexes: [
      { name: 'users_email_idx', unique: false, method: 'gin', columns: ['email'] },
    ],
  }
  const notes: TableDefinition = {
    columns: [
      { name: 'id', type: 'integer', nullable: false, identity: 'always' },
      { name: 'user_id', type: 'bigint', nullable: false },
      { name: 'body', type: 'json', nullable: true },
      { name: 'code', type: 'varchar(3)', nullable: true },
      { name: 'active', type: 'boolean', nullable: true },
      { name: 'status', type: 'public.mood', nullable: true },
      { name: 'created_at', type: 'timestamp', nullable: false, default: 'now()' },
      { name: 'created_at_text', type: 'text', nullable: true, generated: 'created_at::text' },
      { name: 'legacy_id', type: 'bigint', nullable: true, identity: 'by_default' },
    ],
    primaryKey: { name: 'notes_pkey', columns: ['id'] },
    uniques: [],
    checks: [],
    foreignKeys: [
      {
        name: 'notes_user_fk',
        columns: ['user_id'],
        references: { schema: 'public', table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      { name: 'notes_body_idx', unique: false, method: 'gin', columns: ['body'] },
      {
        name: 'notes_active_idx',
        unique: false,
        method: 'btree',
        columns: ['active'],
        where: 'active = 1',
      },
      {
        name: 'notes_code_idx',
        unique: false,
        method: 'btree',
        columns: ['code'],
        where: "code::text <> ''",
      },
    ],
  }
  return {
    nodes: [
      databaseNode('database'),
      enumNode('mood', 'mood', 'public', ['active', 'inactive']),
      tableNode('users', 'users', 'public', users),
      tableNode('notes', 'notes', 'app', notes),
    ],
    edges: [],
    app: { profile: 'database', profileVersion: 2, target: 'sqlite' },
  }
}

function sqliteScript(): string {
  return exportDatabaseDdl(smallCanvas())
}

const TYPE_CASES: Array<[string, string, string[]]> = [
  ['text', 'TEXT', []],
  ['varchar(3)', 'TEXT', ['length(value) <= 3']],
  ['integer', 'INTEGER', []],
  ['bigint', 'INTEGER', []],
  ['decimal(10,2)', 'TEXT', []],
  ['boolean', 'INTEGER', ['value IN (0, 1)']],
  ['uuid', 'TEXT', []],
  ['date', 'TEXT', []],
  ['timestamp', 'TEXT', []],
  ['json', 'TEXT', ['json_valid(value)']],
  ['binary', 'BLOB', []],
  ['smallint', 'INTEGER', []],
  ['real', 'REAL', []],
  ['double precision', 'REAL', []],
  ['jsonb', 'TEXT', ['json_valid(value)']],
  ['time with time zone', 'TEXT', []],
  ['interval', 'TEXT', []],
  ['inet', 'TEXT', []],
  ['cidr', 'TEXT', []],
  ['macaddr', 'TEXT', []],
  ['tsvector', 'ANY', []],
]

describe('SQLite type mapping', () => {
  it.each(TYPE_CASES)('maps %s to %s', (columnType, sqlType, checks) => {
    const plan = sqliteColumnTypePlan(columnType)
    expect(plan.sqlType).toBe(sqlType)
    expect(plan.checks).toEqual(checks)
  })

  it('turns an enum into TEXT with a value CHECK', () => {
    const values = new Map([['task_status', ['open', 'done']]])
    expect(sqliteColumnTypePlan('task_status', values).checks)
      .toEqual(["value IN ('open', 'done')"])
  })
})

describe('SQLite DDL export', () => {
  it.each(fixtures)('exports %s as a script node:sqlite runs', async (name) => {
    const imported = await importDatabaseSql(fixture(name), { wasm })
    const canvas = withCanvasDatabaseTarget(imported.canvas, 'sqlite')
    const db = new DatabaseSync(':memory:')
    expect(() => db.exec(exportDatabaseDdl(canvas))).not.toThrow()
    db.close()
  })

  it('exports STRICT tables with inline foreign keys and flattened schemas', () => {
    const ddl = sqliteScript()
    expect(ddl).toContain('PRAGMA foreign_keys = ON;')
    expect(ddl).toMatch(/CREATE TABLE "?users"? \([\s\S]*\) STRICT;/)
    expect(ddl).toContain('CREATE TABLE app_notes (')
    expect(ddl).toContain(
      'CONSTRAINT notes_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE',
    )
    expect(ddl).toContain('id INTEGER PRIMARY KEY')
  })

  it('runs the script, enforces SQLite constraints, cascades, and fills defaults', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(sqliteScript())

    const user = db.prepare(
      "INSERT INTO users (email, payload) VALUES (?, ?) RETURNING id, active, created_at, token, import_ref, status",
    ).get('abc', '{"ok":true}') as Record<string, unknown>
    expect(user.id).toBe(1)
    expect(user.active).toBe(1)
    expect(user.created_at).toMatch(/^\d{4}-\d{2}-\d{2} /)
    expect(user.status).toBe('active')
    expect(user.token).toBeNull()
    expect(user.import_ref).toBeNull()

    const note = db.prepare(
      'INSERT INTO app_notes (user_id, body, code) VALUES (?, ?, ?) RETURNING id, created_at',
    ).get(1, '{}', 'abc') as Record<string, unknown>
    expect(note.id).toBe(1)
    expect(note.created_at).toMatch(/^\d{4}-\d{2}-\d{2} /)

    expect(() => db.prepare(
      "INSERT INTO app_notes (user_id, status) VALUES (1, 'bogus')",
    ).run()).toThrow(/CHECK constraint failed/)
    expect(() => db.prepare(
      "INSERT INTO app_notes (user_id, code) VALUES (1, 'abcd')",
    ).run()).toThrow(/CHECK constraint failed/)
    expect(() => db.prepare(
      'INSERT INTO app_notes (user_id, active) VALUES (1, 2)',
    ).run()).toThrow(/CHECK constraint failed/)
    expect(() => db.prepare(
      "INSERT INTO app_notes (user_id, body) VALUES (1, 'not json')",
    ).run()).toThrow(/CHECK constraint failed/)
    expect(() => db.prepare(
      'INSERT INTO app_notes (user_id) VALUES (999)',
    ).run()).toThrow(/FOREIGN KEY constraint failed/)

    db.prepare('DELETE FROM users WHERE id = 1').run()
    expect(db.prepare('SELECT COUNT(*) AS count FROM app_notes').get())
      .toEqual({ count: 0 })
    db.close()
  })

  it('keeps supported expressions and comments out PostgreSQL-only ones', () => {
    const ddl = sqliteScript()
    expect(ddl).toContain('CHECK (length(email) > 0)')
    expect(ddl).toContain('GENERATED ALWAYS AS (lower(email)) STORED')
    expect(ddl).toContain('DEFAULT CURRENT_TIMESTAMP')
    expect(ddl).toContain("DEFAULT 1")
    expect(ddl).toContain("DEFAULT 'active'")
    expect(ddl).toContain('-- SQLite: Check "users_created_cast"')
    expect(ddl).toContain('-- SQLite: Generated expression on "app_notes"."created_at_text"')
    expect(ddl).toContain('-- SQLite: Default gen_random_uuid() on "users"."token"')
    expect(ddl).toContain('-- SQLite: Identity on "users"."import_ref"')
    expect(ddl).toContain('-- SQLite: Index "users_email_idx"')
    expect(ddl).toContain('-- SQLite: Index "notes_code_idx"')
    expect(ddl).toContain('CREATE INDEX notes_active_idx ON app_notes (active) WHERE active = 1;')
    expect(ddl).toContain('-- SQLite: Extension "pgcrypto"')
    expect(ddl).toContain('-- SQLite: Extra DDL has no SQLite equivalent')
    expect(ddl).not.toContain('CREATE INDEX users_email_idx')
    expect(ddl).not.toContain('CREATE INDEX notes_code_idx')
  })
})
