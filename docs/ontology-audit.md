# Ontology audit (2026-11-18, base 7102789)

Status: approved 2026-11-18 as recommended. D4: drop `status` from Systems
cards; **keep `owner`** (no recommendation was made, so nothing is cut).

## Result

The bloat is in the shared ontology and in Systems, not in API or Database.

| Area | Today | Proposed | Change |
| --- | --- | --- | --- |
| Card types in `DEFAULT_ONTOLOGY` | 26 | 15 | Delete 10 orphans, fold 2 into `note` |
| Line types in `DEFAULT_ONTOLOGY` | 26 | 10 | Delete 15 orphans, fold 1 |
| Systems profile | 6 cards, 3 notes, 6 lines | 5 cards, 1 note, 4 lines | Biggest cut |
| API profile | 5 cards, 3 notes, 6 lines | 5 cards, 1 note, 6 lines | Notes only; lines are generated |
| Database profile | 4 cards, 3 notes, 2 lines | 4 cards, 1 note, 2 lines | Notes only |
| Decorative fields | about 20 | 0 | Delete fields no code reads |

Opinion behind it: **a type, line, or field stays only if it changes export,
Review, managed lines, or what the card shows.** Anything else is a note.

## Evidence

### 1. Ten card types belong to no profile

`database`, `service`, `api`, `queue`, `event`, `external_system`,
`requirement` are in no profile. `code` is used by Raw only (keep it).

- Only `api` and `database` have a migration (`migrations.ts:27`, to `system`).
- `service`, `queue`, `event`, `external_system` appear only in
  `levels.ts` legacy sets. `requirement` appears only in a test.
- An old canvas with these types has no migration path today. That is a
  latent bug, independent of this cut.

### 2. Fifteen line types belong to no profile

`depends_on owns calls reads_from writes_to deploys_to implements exposes
publishes consumes carries emits handles stores_in orchestrates`.
`migrateEdge` maps 6 of them to `uses`. The other 9 have no mapping.

### 3. API and Database lines are generated, not drawn

`contains`, `accepts`, `returns`, `authenticates_via`, `references` are
managed: code derives them from form fields (`managedRelations.ts`,
`operationRelations.ts`). A user never picks them. They cost the user nothing
and need no recipe step. Systems is the only profile where a person draws
typed lines by hand, so that is where the line vocabulary must be small.

### 4. Fields that no code reads

Shown in the generic form only; no export, Review, or card logic reads them:

| Card | Unread fields |
| --- | --- |
| repository | `defaultBranch` (`provider` feeds derived views only) |
| process | `runbookUrl`, `owner`, `status` |
| artifact | `digest` |
| actor | `responsibility` |
| decision | `rationale`, `owner`, `status` |
| risk | `mitigation`, `severity`, `owner`, `status` |
| system | `deploymentUrl` (migration only), `owner`, `status` |

Fields with real readers (keep): `schema.status/owner/kind/source` and the four
review fields (`jsonSchema.ts`), `api_definition.owner` (OpenAPI contact),
`artifact.schemaMode/schema/schemaRef`, all `security_scheme` fields
(OpenAPI round trip), `table.status`, `database_definition.*`.

### 5. Real usage (local dev data, 61 canvases, read-only)

- 36 Raw and 10 Systems canvases are empty (test leftovers).
- About 9 Systems canvases carry content. No API or Database profile canvas
  exists locally.
- Most used: `system` 57, `note` 50, `schema` 34. Least used: `actor` 1,
  `process` 3, `risk` 2, `decision` 6.
- Lines in those canvases: untyped 77, `relates_to` 51, `depends_on` 31,
  `uses` 26, `calls` 25, `describes` 23. People mostly draw untyped or
  generic lines.
- **8090 data: Unknown.** Its API needs sign-in. Next direct check: count
  types on 8090 through your signed-in session before any migration.

## Proposal

### Shared ontology

1. Delete the 10 orphan card types and 15 orphan line types from
   `DEFAULT_ONTOLOGY`. Keep only their **migration mappings** (below).
2. Fold `decision` and `risk` into `note`: fields `name`, `kind`
   (`note | decision | risk | question`), `body`. The kind sets the card tone.

### Systems profile (v4 to v5)

```text
Cards:  system  repository  actor  artifact  schema   (+ note)
Lines:  uses  produces  defines  relates_to
```

| Change | Why |
| --- | --- |
| `process` becomes `system` with `kind: job` | 3 uses; a scheduled or automated job is a running thing |
| `runs` becomes `uses` | Its only target was `process` |
| `describes` (schema → system) becomes `defines` (system → schema), reversed | Same fact drawn in two directions |
| `system.kind`: `service, api, database, worker, job, cli, external` (+ `queue` if D3) | Absorbs `process`, `external_system`, and `queue` |
| Fields: system `name, kind, purpose, owner, url`; repository `name, url, owner`; actor `name, kind`; artifact `name, kind, version, uri, owner` + schema fields | Only fields shown or read |

### API and Database profiles

No card or line change. Notes fold into `note` with `kind`.

### Migration (one function, `migrations.ts`)

| Old | New |
| --- | --- |
| `service`, `external_system` | `system`, `kind: service` / `external` |
| `queue` | `system`, `kind: queue` (if D3 adds it) |
| `event` | `schema`, `kind: event` |
| `process` | `system`, `kind: job` |
| `requirement`, `decision`, `risk` | `note` with `kind`; old fields appended to `body` as `Label: value` lines |
| `runs`, `calls`, `depends_on`, `reads_from`, `writes_to`, `stores_in`, `consumes`, `exposes`, `orchestrates`, `implements`, `handles`, `carries`, `deploys_to`, `owns` | `uses` |
| `publishes`, `emits` | `produces` |
| `describes` | `defines`, endpoints swapped |
| Dropped fields with a value | Appended to the card description or body, never lost |

Rule: migration never deletes a filled value. It moves it into text.

Rollback risk: the document schema version moves from 2 to 3. An older
image throws "Unsupported canvas document schema version" on any canvas saved
by the new version. Rolling back 8090 after saves needs a forward fix, not a
retag.

## Decisions for you

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Fold `decision` and `risk` into one `note` with a kind? | Yes. Nothing reads their extra fields |
| D2 | Cut `process` into `system kind: job`? | Yes. 3 uses, and it removes `runs` |
| D3 | Add `queue` as a `system.kind`? | Yes. Queues are real in your pipelines and cheap as a kind |
| D4 | Drop `owner` and `status` from Systems cards? | Yes for status; **your call for owner** (filled on 37 of 57 systems, but nothing reads it) |
| D5 | Keep the four schema review fields (`reviewStatus`, `reviewedVersion`, `lastReviewed`, `reviewIntervalDays`)? | Keep for now. Code uses them; cutting them is a feature decision, not bloat |

Strongest challenge: `levels.ts` (Context/Containers/Components/Contracts)
reads `runs`, `produces`, `defines`, `describes`. Cutting lines means
updating level assignment in the same change. It also overlaps the parked
"Levels Step 2" work.

## After approval

1. opencode: one commit for the shared cut and migration, with a migration
   test that loads a canvas using every old type and line.
2. One commit for Systems v5 and `levels.ts`.
3. Rebuild 8090 only after you approve and after the 8090 count.
4. Then write `recipes/systems.md` and `recipes/api.md` on the smaller ontology.
