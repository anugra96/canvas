# Database Targets

Status: Accepted (2026-11-23). Phase 1 built (`9ca0c18`..`7331ff9`), Phase 2 built (`a9a3422`..`5cc4b6f`); Phases 3–5 not built
Applies to: Database canvases. Extends `database-profile.md`; replaces its "PostgreSQL only" decision.

## Decision

A Database canvas holds one **neutral data model**: tables, columns with neutral
types, keys, relations, enums, and sample rows. The user may design without
choosing a database. A **target** (PostgreSQL, SQLite, or DynamoDB) can be set at
any time in **Database settings**. The target adds:

- a type mapping from neutral types to the target's types,
- target rules as Review issues ("what blocks export to this target"),
- the target's export (and later import).

One model with one adapter per target. No second Database profile, no parallel
stores. Switching the target never rewrites the model; Review reports what does
not fit.

```text
Neutral model ──► Target adapter (types · rules · export) ──► Review issues ──► Export
                    PostgreSQL │ SQLite │ DynamoDB
```

## Target

| Value | Meaning |
| --- | --- |
| absent | Not chosen: neutral checks only; Export asks the user to choose a target |
| `postgres` | PostgreSQL 15+ (today's behaviour) |
| `sqlite` | SQLite 3.37+ (`STRICT` tables available) |
| `dynamodb` | Amazon DynamoDB |

Stored as `app.target` on the canvas root, beside `profile` and `reviewMode`.

Existing canvases are PostgreSQL: a profile migration (Database `profileVersion`
1 → 2) sets `app.target: "postgres"` on every Database canvas that has no target.
New canvases start without a target. A canvas created by Import DDL starts with
`target: "postgres"`.

The migration also rewrites a column type that is exactly `timestamp` (any case)
to `timestamp without time zone`: that is what PostgreSQL reads it as, and the
neutral `timestamp` means an instant (`timestamp with time zone`). Nothing else in
the model is rewritten.

## Neutral types

A column `type` holds a neutral type, an enum name, or a native type of the
current target. Native types are allowed so imported DDL loses nothing; Review
flags them when they do not map to another chosen target.

| Neutral | PostgreSQL | SQLite (STRICT) | DynamoDB attribute |
| --- | --- | --- | --- |
| `text` | `text` | `TEXT` | `S` |
| `varchar(n)` | `character varying(n)` | `TEXT` + `CHECK (length(x) <= n)` | `S` (length rule in Review only) |
| `integer` | `integer` | `INTEGER` | `N` |
| `bigint` | `bigint` | `INTEGER` | `N` |
| `decimal(p,s)` | `numeric(p,s)` | `TEXT` (exact) or `REAL` (warning) | `N` |
| `boolean` | `boolean` | `INTEGER` + `CHECK (x IN (0,1))` | `BOOL` |
| `uuid` | `uuid` | `TEXT` | `S` |
| `date` | `date` | `TEXT` (ISO 8601) | `S` (ISO 8601) |
| `timestamp` | `timestamp with time zone` | `TEXT` (ISO 8601) | `S` (ISO 8601) or `N` (epoch) |
| `json` | `json` | `TEXT` + `CHECK (json_valid(x))` | `M` / `L` |
| `binary` | `bytea` | `BLOB` | `B` |
| enum | `CREATE TYPE … AS ENUM` | `TEXT` + `CHECK (x IN (…))` | `S` (values in Review only) |

Today's Postgres type strings map to neutral types on read (`timestamp with time
zone` → `timestamp`); others (`inet`, `macaddr`, `jsonb`) stay native Postgres.
The PostgreSQL adapter writes a neutral type unchanged except `timestamp` →
`timestamp with time zone` and `binary` → `bytea`, so existing canvases export
byte-identical DDL. `json` stays `json` for the same reason; a later PostgreSQL
check may suggest `jsonb`.

## Features per target

| Feature | PostgreSQL | SQLite | DynamoDB |
| --- | --- | --- | --- |
| Schemas (namespaces, lanes) | Yes | No: Review warns; export flattens with a `<schema>_` prefix | No |
| Identity / auto id | Identity | `INTEGER PRIMARY KEY` | No: app-generated ids |
| Foreign keys | Enforced | Enforced with `PRAGMA foreign_keys = ON` | Not enforced: item collections or denormalised copies |
| CHECK, generated columns | Yes | Yes | No: Review lists them as not enforced |
| Partial / expression indexes | Yes | Yes | No: GSIs on attributes only |
| Joins | Yes | Yes | No: access patterns must be served by keys |

## DynamoDB needs access patterns

A relational model does not say how DynamoDB keys should look. With target
`dynamodb`, the canvas asks for **access patterns**: named reads and writes the app
performs, e.g. "Get order by id", "List orders for customer, newest first".

| Field | Example |
| --- | --- |
| Name | List orders for customer |
| Entity | `orders` |
| Key condition | `customer_id = ?`, sorted by `created_at` desc |
| Frequency | High / Medium / Low |

Key design per table (or per entity in a single table): partition key and sort key
as attribute templates (`CUSTOMER#<customer_id>`, `ORDER#<created_at>`), plus GSIs.
Table layout: one table per entity by default; single-table design is a later option.

Review rules for DynamoDB: every access pattern is served by the table key or a
GSI; no pattern needs a join; hot-partition warning when a high-frequency pattern
uses a low-cardinality key; estimated item size from sample rows under 400 KB;
CHECK, enum, and FK rules are listed as not enforced.

## Review

| Group | Runs when | Examples |
| --- | --- | --- |
| Neutral | Always | Table without primary key, FK target missing, duplicate column, FK type mismatch, sample row invalid |
| PostgreSQL | target `postgres` | Reserved identifier, FK without index, `timestamp` without time zone (today's Phase 2 list) |
| SQLite | target `sqlite` | Namespaces flattened, `decimal` stored as REAL, ALTER limits on later migration |
| DynamoDB | target `dynamodb` | Access pattern not served, join needed, hot partition, item too large |

Codes carry a prefix per group (`pg_`, `sqlite_`, `ddb_`). Mode tiers as today:
Publish blocks export.

## Sample rows

The Rows preview (Edit Table > Rows) validates against neutral
types first (required, type, key uniqueness, FK presence among sample rows), then
the target's limits (integer ranges, `varchar(n)`, DynamoDB item size).

Built (2026-11-24): two row sets, Sample rows (saved on the table's `samples`
field, 20) and Test data (session only, 1,000). Cells are plain text typed like a
markdown table: Tab and Enter move between cells and add a row at the end; an
all-empty row is a draft and is not counted or saved. Paste accepts a markdown
table, CSV with a header row, or a JSON array.

## SQLite (Phase 3)

Export writes one script that runs in `sqlite3` as is. What PostgreSQL has and
SQLite does not becomes a Review issue and, in the script, a `--` comment, never
a failing statement.

| Model | SQLite export | Review (`sqlite_` codes) |
| --- | --- | --- |
| Script header | `PRAGMA foreign_keys = ON;` | — |
| Table | `CREATE TABLE … STRICT`; foreign keys inline (SQLite has no `ALTER TABLE ADD CONSTRAINT`) | — |
| Schema other than `public` | Name flattened to `<schema>_<table>` | Warning: namespace flattened; error when two names collide |
| Neutral types | As the Neutral types table (`varchar(n)`, `boolean`, `json`, enum become `TEXT`/`INTEGER` plus a `CHECK`) | — |
| `decimal(p,s)` | `TEXT` (exact) | Warning: stored as text |
| Postgres native types | `smallint` → `INTEGER`; `real`, `double precision` → `REAL`; `jsonb` → `TEXT` + `json_valid`; time, interval, inet, cidr, macaddr → `TEXT`; others → `ANY` | Warning on `ANY` |
| Single-column integer primary key with identity | `INTEGER PRIMARY KEY` | — |
| Identity elsewhere | Omitted | Warning |
| Defaults | Literals kept (`true`/`false` → `1`/`0`); `now()`, `CURRENT_TIMESTAMP` → `CURRENT_TIMESTAMP`; other function defaults (`gen_random_uuid()`) commented out | Warning per unsupported default |
| CHECK, generated, partial index `WHERE` | Copied; an expression with Postgres-only syntax (`::`, `~`, `ILIKE`, `SIMILAR TO`, unknown functions) is commented out | Warning per commented-out expression |
| Index method other than btree | Commented out | Warning |
| Comments | `--` lines | — |
| Extensions, Extra DDL | Commented out | Warning when present |

## UI

- **Database settings** gets a **Target** select: Not chosen, PostgreSQL, SQLite,
  DynamoDB, with one line on what each changes.
- The empty-canvas heading reads "Design a database"; the hint says a target can
  be chosen later.
- Type pickers list neutral types first, then the target's native types.
- **Export** shows the target's format; without a target it is disabled with
  "Choose a target in Database settings".
- DynamoDB adds **Access pattern** cards (linked to tables, so Review can point at
  them) and key fields per table.

## Phases

| Phase | Work | Gate |
| --- | --- | --- |
| 1 | `app.target`, migration to `postgres`, neutral type map, Postgres moved behind an adapter (no behaviour change), Target select, export gating | Existing Postgres canvases export byte-identical DDL |
| 2 | Rows preview with neutral validation | Table-driven validation test |
| 3 | SQLite adapter: types, rules, DDL export | Exported DDL runs in `sqlite3` |
| 4 | DynamoDB: access pattern cards, key design, rules, CloudFormation YAML export | Exported template passes `cfn-lint`; every example pattern served |
| 5 | Imports: SQLite DDL, DynamoDB CloudFormation | Round trip |

## Decisions (accepted 2026-11-23)

1. Existing Database canvases migrate to `target: "postgres"`; new canvases start without a target.
2. Access patterns are cards on the canvas, linked to tables, so Review can point at them.
3. DynamoDB defaults to one table per entity.
4. DynamoDB export is CloudFormation YAML.
