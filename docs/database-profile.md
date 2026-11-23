# Database Profile Contract

Status: Phase 1 built (`aa7b002`, `92d5588`). Phase 4 built (`684bc9b`). Phases 2 and 3 not built
Profile ID: `database`
Version: `1`
Format: PostgreSQL DDL (Postgres 15+), `pg_dump --schema-only` output

## Decision

Canvas gets a fourth profile, **Database**. A Database canvas designs one
PostgreSQL database at table and column level. A Systems canvas stays at
architecture level and links to it from a Database card (Phase 4).

PostgreSQL DDL is the exchange format. Import gives an accurate canvas from an
existing database (`pg_dump --schema-only`) or a migrations folder's output.
Export gives DDL that `psql` runs, plus migration SQL between two versions.
Canvas is a design surface for Postgres, not a competing schema format.

This follows the API profile pattern: a real standard is the source of truth,
relations are derived from it, and checks plus a change diff make design safe.

Today an ERD is drawn with Schema cards of kind `database` (see
`examples/order-erd.canvas`). That stays valid in Systems, but JSON Schema has no
types, keys, indexes, or nullability in Postgres terms, so it cannot give
confident database design.

```text
Database canvas  [Database: canvas_auth (Postgres 16)]
                   ├─contains─> [Schema: public]  (a lane)
                   │              ├─ [Table: user]          id PK · email UQ · name
                   │              ├─ [Table: session]       id PK · user_id FK ──references──> user.id
                   │              └─ [Table: member]        organization_id FK ──references──> organization.id
                   └─ [Enum: member_role]  owner | editor | viewer
```

## Cards

| Card | Entity id | Postgres source | Responsibility |
| --- | --- | --- | --- |
| Database | `database_definition` | Database name, server version, extensions, unsupported statements | One per canvas |
| Schema | `db_schema` | `CREATE SCHEMA` (a namespace) | A lane that groups tables. `public` is created on import when used |
| Table | `table` | `CREATE TABLE` plus its constraints, indexes, and comments | One table |
| Enum | `db_enum` | `CREATE TYPE ... AS ENUM` | One enum type |

Annotation: Note (shared); its kind sets a short label and tone.

The user-facing label of `db_schema` is **Schema**. It is not the JSON Schema
card; the Database profile does not offer that card. A durable state boundary in Systems is a System with kind `database`.

### Fields

| Card | Fields |
| --- | --- |
| Database | Name, Server version, Description, Owner, Extensions (one per line), Extra DDL (read-only text) |
| Schema | Name, Description (`COMMENT ON SCHEMA`) |
| Table | Name, Schema, Description (`COMMENT ON TABLE`), Status (planned, active, deprecated), Definition (JSON, below) |
| Enum | Name, Schema, Values (one per line, order kept), Description |

Table **Definition** (zod schema in the contract package, `version: 1`):

```ts
interface TableDefinition {
  columns: Array<{
    name: string
    type: string            // as Postgres prints it: "text", "timestamp with time zone", "numeric(10,2)", "member_role"
    nullable: boolean
    default?: string        // SQL expression text, e.g. "now()"
    identity?: 'always' | 'by_default'
    generated?: string      // GENERATED ALWAYS AS (<expr>) STORED
    comment?: string
  }>
  primaryKey?: { name?: string; columns: string[] }
  uniques: Array<{ name?: string; columns: string[] }>
  checks: Array<{ name?: string; expression: string }>
  foreignKeys: Array<{
    name?: string
    columns: string[]
    references: { schema: string; table: string; columns: string[] }
    onDelete?: 'no_action' | 'restrict' | 'cascade' | 'set_null' | 'set_default'
    onUpdate?: 'no_action' | 'restrict' | 'cascade' | 'set_null' | 'set_default'
  }>
  indexes: Array<{ name: string; unique: boolean; method: string; columns: string[]; where?: string }>
}
```

`columns` in an index may be an expression in parentheses, e.g. `(lower(email))`.

## One source of truth per fact

| Fact | Stored in | Notes |
| --- | --- | --- |
| Columns, keys, checks, indexes | Table Definition | The table form edits it; no second copy |
| Foreign key | Table Definition `foreignKeys` | The `references` edge is derived and managed (`app.managed: true`). Drawing an edge from column A to table B adds a foreign key to the Definition; deleting the edge removes it |
| Enum values | Enum card | A column of that type stores only the type name |
| Table membership in a Schema | Table `Schema` field | The lane is derived; dragging a table to another lane changes the field |
| Statements the model does not cover (functions, triggers, policies, grants, views) | Database Extra DDL, verbatim | Exported after tables, in source order. Shown read-only with a count |

## Canvas presentation

- **Table card preview:** the table name, then one row per column: name, type,
  and badges `PK`, `FK`, `UQ`, `NULL` (only when nullable), `IDX` (when the
  column leads an index). No raw JSON on the card. Long tables show the first
  12 columns and "+N more".
- **Edges:** one `references` edge per foreign key, from the child column row to
  the parent column row (one handle per column row). The label shows
  `ON DELETE CASCADE` only when it is not the default. Enum usage draws no edge;
  the type name is shown on the column.
- **Layout (Tidy database layout):** one lane per Schema. Inside a lane, tables
  are ordered by foreign-key depth: referenced (parent) tables left, children
  right, so edges point left. Cycles are broken at the nullable foreign key.
  Enums sit in a row above the lanes. New cards use the same rule as API: only
  the new card moves. Same input gives the same positions.

## Design tools

### Phase 1: model, import, export

1. Profile, cards, forms, preview, and managed `references` relations.
2. **Import DDL:** paste or upload a `.sql` file. Supported: `CREATE SCHEMA`,
   `CREATE TYPE ... AS ENUM`, `CREATE TABLE` (columns, inline and table
   constraints, identity, generated), `ALTER TABLE ... ADD CONSTRAINT`,
   `CREATE [UNIQUE] INDEX`, `COMMENT ON`, `CREATE EXTENSION`. Every other
   statement goes to Extra DDL with a count in the import note.
3. **Export DDL:** deterministic order: extensions, schemas, enums, tables
   (columns and non-FK constraints), foreign keys as `ALTER TABLE`, indexes,
   comments, Extra DDL. Identifiers are quoted only when needed.
4. **Table form:** a column grid (name, type, nullable, default, PK, unique),
   with add, remove, and reorder; a Foreign keys section; an Indexes section.
   Types offer a list of common Postgres types plus the canvas's enums, and
   accept free text.
5. **Add table** command: name, schema, and a starter `id` column
   (`uuid` default `gen_random_uuid()`, or `bigint` identity), plus
   `created_at timestamptz not null default now()`.

### Phase 2: checks

Same Review panel, Issues, Fixes, and ignore-with-reason behaviour.

| Code | Severity | Rule | Fix |
| --- | --- | --- | --- |
| `fk_target_missing` | Error | A foreign key names a table or column that does not exist | — |
| `fk_type_mismatch` | Error | A foreign-key column type differs from the referenced column type | Set the child type |
| `fk_target_not_unique` | Error | The referenced columns are not a primary key or unique constraint | — |
| `column_duplicate` | Error | Two columns with the same name in one table | — |
| `table_without_primary_key` | Warning | No primary key | Add `id` column |
| `fk_without_index` | Warning | No index leads with the foreign-key columns | Add index |
| `timestamp_without_time_zone` | Warning | A column uses `timestamp` without time zone | Change to `timestamptz` |
| `index_duplicate` | Warning | Two indexes on the same columns, method, and predicate, or an index the primary key already covers | Remove the duplicate |
| `enum_unused` | Warning | No column uses the enum | — |
| `naming_inconsistent` | Warning | A table or column name differs from the canvas's majority case style (normally `snake_case`) | — |
| `reserved_identifier` | Warning | A name is a Postgres reserved word and needs quoting (`user`, `order`) | — |

### Phase 3: migration diff

**Compare** the canvas with a DDL file or another Database canvas. The result
lists each change with its migration SQL and a risk level:

| Change | Risk | Why |
| --- | --- | --- |
| Drop table or column | Breaking | Data loss; readers fail |
| Change a column type | Breaking unless widening (`varchar(n)` to larger or `text`) | Table rewrite and an `ACCESS EXCLUSIVE` lock |
| Add `NOT NULL` column without a default | Breaking on a non-empty table | The statement fails |
| Set `NOT NULL` on an existing column | Risky | Full scan under lock; suggest a `CHECK ... NOT VALID` then validate |
| Add a foreign key | Risky | Validation scan; suggest `NOT VALID` then `VALIDATE CONSTRAINT` |
| Create an index | Risky | Blocks writes; suggest `CREATE INDEX CONCURRENTLY` |
| Remove an enum value | Breaking | Postgres cannot drop an enum value; needs a new type |
| Add a nullable column, table, enum value, or comment | Safe | — |

**Copy migration** gives the SQL in a safe order with the suggestions applied
as comments. **Copy changelog** gives a Markdown summary. The diff does not run
SQL against any database.

### Phase 4: tie into Systems and API

- A Systems Database card gets an optional link to a Database canvas, like a
  System of kind `api` links to an API canvas. Decided 2026-11-23: a System of
  kind `database` shows **Create or open Database canvas**, on the same code
  path as the API button; the link label is "Database canvas".
- Later, not in v1: a check that an API Schema card's properties match a
  table's columns when they are linked.

### Later, not in this spec

| Tool | Why later |
| --- | --- |
| Live introspection of a running database | Needs credentials and a network path from the API; `pg_dump --schema-only` covers it safely |
| MySQL, SQLite, DynamoDB | Different models; a dialect field is reserved but only `postgres` is accepted |
| Views, functions, triggers, RLS policies as cards | Kept verbatim in Extra DDL first; promote one only on demand |
| Running migrations | A design tool must not mutate databases |

## Parser

**Decision (spike 2026-11-17):** `libpg-query@18.2.4` (the Postgres 18 parser
compiled to WebAssembly, MIT) plus `pgsql-deparser@18.4.5` (MIT) to turn
expression ASTs (defaults, checks, generated columns, partial-index predicates)
back into SQL text. Pin exact versions.

| | `libpg-query` + deparser | `pgsql-ast-parser` (rejected) |
| --- | --- | --- |
| Spike fixtures | 3 of 3, 58 of 58 statements | Aborts on the `pg_dump`-style fixture; 7 of 42 statements unsupported (owners, triggers, deferrable or `NOT VALID` constraints) |
| Source positions for Extra DDL | Every statement | Only statements it parses |
| Node and browser | Both | Both |
| Lazy load, gzip | 395 kB (339 kB is WASM) | 42 kB |

- Load it lazily from the import dialog only, so the main bundle does not grow.
  Export does not need a parser.
- Serve the `.wasm` file as a static asset and pass it to `loadModule({ wasm })`.
  Otherwise the module fetches `/libpg-query.wasm`, gets `index.html`, and logs
  a compile error. The web image's CSP (if any) must allow
  `wasm-unsafe-eval`.
- Unmodelled statements (SET, owners, sequences, functions, triggers) go to
  Extra DDL verbatim, with byte offsets.
- Normalise `serial` to identity on import. Otherwise Extra DDL would need
  `CREATE SEQUENCE` ahead of the tables.
- Not in v1 Definition, possible later because the parser exposes them: FK
  deferrability, `NOT VALID`, identity sequence options. Import keeps a warning
  when it drops one.

## Proof

| Risk | Proof seam |
| --- | --- |
| Import or export loses data | Round-trip test in the contract package: import, export, import again, and deep-equal the two canvases' Definitions, for every fixture |
| Managed relations drift | Table-driven test: Definition edit -> expected `references` edges, and edge draw or delete -> expected Definition |
| Layout is unreadable | Table-driven layout test on the fixtures: no overlaps; every table inside its lane; no drawn edge crosses a card other than its own endpoints; deterministic |
| Checks are wrong | One table-driven test with a passing and a failing table per rule |
| Diff misses a break | Table-driven test with one pair of DDL documents per row in the diff table |
| UI flow breaks | One E2E test: import a fixture, add a column in the form, export, and find the column in the DDL |

Fixtures (in `packages/canvas-contract/src/database/fixtures/`, source noted):

- `auth-better-auth.sql`: `pg_dump --schema-only` of the Better Auth tables
  (`user`, `account`, `session`, `verification`, `organization`, `member`)
  once `docs/auth.md` is built. Until then, a hand-written equivalent marked as
  such. It exercises reserved names (`user`), foreign keys, and unique indexes.
- `order-erd.sql`: the commerce ERD from `examples/order-erd.canvas` as DDL.
- One synthetic file that uses every supported statement plus one function and
  one trigger (to prove Extra DDL round-trips).

## Contract changes

- `packages/canvas-contract`: `DATABASE_PROFILE`; entity types
  `database_definition`, `db_schema`, `table`, `db_enum`; relation type
  `references` (managed); edge meta `fromColumn`, `toColumn`; `database/` module
  (model, import, export, layout, managed relations, checks, diff).
- No change to stored Systems, Raw, or API canvases. No migration.

## Decisions

| Decision | Choice | Strongest challenge |
| --- | --- | --- |
| Source of truth | Structured Definition JSON on the Table; DDL is import and export | Storing verbatim `CREATE TABLE` text is closer to the standard; but forms, checks, and diffs need structure, and `ALTER` statements spread one table's facts over several statements |
| Dialect | Postgres only in v1 | Wider reach; but each dialect has its own types, locks, and migration risks, and Skyward runs Postgres |
| Foreign keys | Stored on the child table; edges derived | Editable edges feel more natural; drawing still works because it edits the Definition |
| Column-level edges | One handle per column row | Table-level edges are simpler; but an ERD that does not show which column joins is hard to trust |
| Parser | Real Postgres parser, lazily loaded | Bundle size; mitigated by lazy loading, and confirmed in the spike |

## Open questions

- Should the Systems `database` card be renamed in the UI to avoid confusion
  with `database_definition`? Recommended: keep both labels "Database"; they
  live in different profiles.
- Should Phase 3 also accept a migrations folder (ordered `.sql` files) as the
  base? Recommended: later; `pg_dump --schema-only` of the base is enough.
