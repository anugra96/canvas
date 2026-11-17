# Schema Builder, Rows Preview, and Embedded Schemas

Status: Proposed MVP (draft 2026-11-16, not built)
Applies to: Schema cards (Systems and API profiles); Artifact cards (Systems)

## Decision

Schemas become easier to design and less noisy on the canvas.

1. **Builder:** the schema workbench gets three tabs on one source:
   **Fields** (a structured editor), **Rows** (a live table of sample records),
   and **JSON** (today's editor). The JSON Schema `source` stays the only source
   of truth; Fields and Rows read and write it.
2. **Embedded schemas:** an Artifact can define its schema inside the card or
   reference a shared Schema card. No edge is needed. A schema used by one card
   lives in it; a schema that several cards depend on stays a Schema card,
   because that dependency is what a system design must show.

```text
Artifact: Fire risk dataset            Schema: JobEvent (shared card)
  Schema ○ None ● Define here ○ Use shared      ▲
  [Fields] [Rows] [JSON]                        │ schemaRef (no drawn edge;
                                                │ Levels draws it at level 4)
Artifact: Job events export ── Schema ● Use shared: JobEvent
```

## Workbench tabs

### Fields

A grid with one row per property: **Name, Type, Required, Nullable,
Description**, and an expandable **Details** row.

| Type choice | Writes |
| --- | --- |
| string, number, integer, boolean | `type` |
| object | `type: "object"`, `properties`, `required`; nested rows expand in place |
| array of <type> / array of object | `type: "array"`, `items` |
| enum | `type` plus `enum` (values edited one per line) |
| shared schema | `$ref: "#/components/schemas/<Name>"`, picked from the canvas's Schema cards |

- **Nullable** writes `type: ["<type>", "null"]`.
- **Details** by type: string `format` (date, date-time, uri, email, uuid),
  `minLength`, `maxLength`, `pattern`; number `minimum`, `maximum`; any
  `default`.
- Add, delete, rename (rename also updates `required`), move up and down.
- **Lossless:** the builder writes only the keywords above. Every other keyword
  on a property or the root is kept. A property that uses `oneOf`, `anyOf`,
  `allOf`, `not`, `if`, `patternProperties`, or `$defs` shows as a read-only
  "Advanced, edit in JSON" row.
- Key order is kept; new properties are appended.
- If `source` is not valid JSON, Fields and Rows show "Fix the JSON first" and
  link to the JSON tab.

### Rows

A table whose columns come from the schema and whose rows are sample records,
validated live with Ajv.

- **Columns:** top-level properties in order, with type and `*` for required
  in the header. A nested object becomes dotted columns one level deep
  (`owner.name`); deeper values and arrays show a compact cell (`2 items`) that
  opens a JSON popover editor. A root that is not an object has one `value`
  column.
- **Cell editors** follow the type: select for enums, toggle for booleans,
  date input for `date` and `date-time`, number input. Free text is always
  possible so invalid values can be tested. An empty cell means the property is
  absent; `null` is a separate choice shown only when the property is nullable.
- **Validation:** each row is validated against the current schema on every
  edit of the row or the schema. Errors map to cells by `instancePath`; a
  missing required property marks that column's cell. Each row shows ✓ or ✗;
  the header shows `2 of 3 rows valid`.
- `$ref` to `#/components/schemas/<Name>` resolves against the Schema cards on
  the same canvas, on both profiles.

Two row sets:

| Set | Stored | Limit | Actions |
| --- | --- | --- | --- |
| **Examples** | The schema's standard `examples` array in `source` | 5 rows | Add row, delete row, **Generate** (one full row and one with only required properties, from `generateExample`) |
| **Test data** | Session only; never saved | 1,000 rows | **Paste rows** (JSON array, or CSV with a header row of property names, values converted by column type), **Show invalid only**, **Clear** |

Saved examples are exported in OpenAPI and checked by the existing
`example_invalid` rule.

### JSON

Today's editor, diagnostics, and review fields, unchanged.

## Embedded schemas on Artifact

New Artifact fields:

| Field | Values |
| --- | --- |
| `schemaMode` | `none` (default), `inline`, `shared` |
| `schema` | JSON Schema source, when `inline` |
| `schemaRef` | The id of a Schema card on the same canvas, when `shared` |

- The Artifact form gets a **Schema** section with the three choices. **Define
  here** opens the same workbench (Fields, Rows, JSON) without review fields: an
  embedded schema uses the Artifact's owner and version. **Use shared** shows a
  picker of Schema cards and an **Open** link.
- **Card preview:** one chip, `Schema · 6 fields` or `Schema · JobEvent
  (shared)`. No schema text on the card.
- **Extract to shared schema** (inline only): creates a Schema card with the
  same source, name `<Artifact name> schema`, kind from the Artifact kind
  (`dataset`, `config`, else `other`), version from the Artifact or `1.0.0`,
  owner from the Artifact, status `draft`. It is placed with the existing
  new-card placement, and the Artifact switches to `shared`.
- **Inline into card** (shared only): copies the shared source into the
  Artifact and switches to `inline`. The Schema card is not deleted; if nothing
  else uses it, the existing `schema_unlinked` warning appears and the user
  decides.
- No edge is created. `schemaRef` counts as a link for `schema_unlinked`, and
  Levels draws it as a derived `uses` edge at level 4.

Review:

| Code | Severity | Rule |
| --- | --- | --- |
| `schema_ref_missing` | Error | `schemaRef` names no Schema card on the canvas |
| `schema_invalid` (extended) | Error | An inline Artifact schema fails JSON or meta-schema validation; `nodeId` is the Artifact, `fieldKey` is `schema` |

## Not in the MVP

| Item | Why later |
| --- | --- |
| Schemas on Process (inputs and outputs) | Artifacts already carry what processes produce; add on demand |
| Suggest schema from pasted rows | Useful for datasets; needs type inference rules |
| Sub-tables for arrays | The JSON popover covers editing; sub-tables are a UX upgrade |
| Database table column grid | Database Phase 1 reuses the Rows table |
| "Two Artifacts define the same schema" suggestion | Needs a stable structural comparison first |
| Moving existing Schema cards into Artifacts | Systems rules never linked Artifacts to Schemas, so nothing needs to move |

## Proof

| Risk | Proof seam |
| --- | --- |
| The builder loses or corrupts schema data | Table-driven test of the field model: source -> edit operation -> source, including kept unknown keywords, nested objects, `required` on rename, nullable, and Advanced rows left untouched |
| Errors show on the wrong cell | Table-driven test: schema and row -> expected cell errors (type, format, enum, required, nested path) |
| Examples drift from the schema | Covered by the existing `example_invalid` rule |
| Extract or Inline loses the schema | One test: inline -> extract -> inline gives the original source; the Schema card remains |
| Broken reference | One test for `schema_ref_missing` |
| UI flow breaks | One E2E test: open a Schema card, add a required string field in Fields, see the column in Rows, clear it in a row, and see the row marked invalid |

## Contract changes

- `packages/canvas-contract`: Artifact fields `schemaMode`, `schema`,
  `schemaRef`; issue code `schema_ref_missing`; a pure field-model module
  (`jsonSchema/fieldModel.ts`) shared by the web app and, later, Database
  Phase 1. Ajv validation stays in `web/src/canvas/schema/`.
- No migration: existing Artifacts have no schema fields and default to `none`.
