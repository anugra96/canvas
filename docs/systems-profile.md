# Systems Profile Contract

Status: Implemented v5
Profile ID: `systems`
Version: `5`
Scope: `container`

## Decision

Systems is the minimal systems-design and architecture-review profile. It keeps
runtime, contract, state, people, and supply-chain objects as separate
responsibilities without exposing every implementation subtype.

Raw remains the freeform escape hatch. Pipeline execution remains a separate
future profile.

## Core Cards

| Card | Responsibility | Examples |
| --- | --- | --- |
| System | Runtime, job, API, database, queue, CLI, worker, or external dependency | Service, job, API, database, queue, worker, CLI, external |
| Repository | Source code location | GitHub, GitLab, local, other |
| Actor | Human responsibility | Person, role, team |
| Artifact | Versioned deliverable | Manifest, container, model, config, dataset, document |
| Schema | Versioned contract | JSON Schema for API payloads, databases, events, config, datasets |

Annotation: Note. A Note has a `kind` (`note`, `decision`, `risk`, `question`)
that sets a short label and tone on the card.

## Default Fields

| Card | Fields |
| --- | --- |
| System | Name, Kind, Purpose, Owner, URL |
| Repository | Name, URL, Owner, Purpose |
| Actor | Name, Kind, Purpose |
| Artifact | Name, Kind, Version, URI, Owner, Purpose, Schema mode, Schema, Shared schema |
| Schema | Name, Contract kind, Version, Owner, Status, Review status, Reviewed version, Last reviewed, Review interval, JSON Schema |
| Note | Name, Kind, Body |

Field choices:

- System Kind: service, api, database, queue, worker, job, cli, external
- Actor Kind: person, role, team
- Artifact Kind: manifest, container, model, config, schema, dataset, document
- Note Kind: note, decision, risk, question

## Relations

| Relation | Allowed source -> target |
| --- | --- |
| `uses` | Actor, System, or Repository -> System, Repository, Artifact, or Schema; Schema -> Schema |
| `produces` | System or Repository -> Artifact |
| `defines` | Repository or System -> Schema |
| `relates_to` | Note -> anything; architecture card -> Note |

Default relation selection follows the rule order above: `uses`, then
`produces`, then `defines`, then `relates_to`.

## Open Linking

Any two content cards can be connected. A relation type is optional.

- New Systems edges default to **Unspecified** and display **Define relation**.
- The relation picker lists every Systems relation, not only compatible ones.
- Choosing a relation that is invalid for the source and target is allowed.
- The UI flags an unspecified or invalid relation through the Review panel.
- Invalid connections are never blocked.
- Groups remain invalid because groups are not graph endpoints.

## Validation

Warnings do not block saving. One **Review** panel has **Issues** and **Fixes**
tabs. Issues is a minimal grouped, read-only diagnostic list with ignored items.
Fixes shows suggested repairs with a short context, optional **Show** to zoom to
the area, and **Fix** to apply the change as one undoable edit. The panel
remembers the last tab while the editor session remains open. A warning badge
opens Issues at that warning.

- Edge relations are changed from the selection toolbar. It applies one relation
  to every selected edge as a single undoable edit.
- Ignored warnings require a reason. They are stored in the canvas metadata and
  can be restored from the Ignored filter.
- The MVP semantic check: an Artifact needs a producer from a System or
  Repository. Fixes offers to add the missing producer card.
- Untyped text cards are warnings.
- Unknown entity or relation types are warnings.
- Missing required fields are warnings.
- Invalid source/target relation pairs are warnings.
- Group endpoints are warnings.
- Every content card has a title or name.
- JSON Schema contracts are parsed and meta-validated.
- Active API and database Systems should have a linked schema contract.

## Layout

- Cards use the existing canvas card renderer.
- Properties appear above the note/content preview.
- The whole card outline is the connection handle.
- Double-click a card edge to fit it to its content.
- Groups remain visual boundaries and are not semantic endpoints.
- Capability and product boundaries can use groups instead of card types.

## Derived views

Derived views are read-only projections of the source canvas. They use the
current editor state, including unsaved changes, and never write cards or
relations back to the source.

| View | Cards | Relations |
| --- | --- | --- |
| Architecture | All architecture cards; annotations and groups excluded | All explicit relations between included cards |
| Runtime | Actor, System, Artifact | `uses`, `produces` |
| Data flow | System, Artifact, Schema | `uses`, `produces`, `defines` |
| Contracts | Schema plus the System or Repository endpoints of contract relations | `defines`, `uses` where a Schema is an endpoint |
| Pipeline | Actor, Repository, System, Artifact | `uses`, `produces` |
| Sequence | Selected System with kind `job` plus participants within two relation hops | Explicit non-annotation relations between participants |

Sequence diagrams require an opinionated order because architecture relations do
not carry timestamps. The order is deterministic:

1. Inbound `uses` relations to the selected job.
2. Outbound relations from the job, ordered `uses`, then `produces`.
3. Remaining participant relations, ordered `uses`, `produces`, then `defines`.
4. Stable participant and relation IDs break ties.

The sequence is an inferred aid, not a runtime trace. Relation direction defines
sender and receiver.

## Schema contracts

Schema is a first-class contract, not an Artifact kind. Artifact is a concrete
versioned deliverable; Schema is the normative structure shared across components.

- JSON Schema is the first supported format. Draft-07, 2019-09, and 2020-12
  meta-validation are supported where the bundled Ajv validator supports them.
- The Schema card source is authoritative so the outline, validation, and review
  feedback remain synchronized.
- `defines` connects repositories or systems to schemas they own, including the
  API or database System the schema governs.
- `uses` declares that a system, repository, or schema consumes a schema contract.
- Schema-to-schema `uses` records ERD/foreign-key relationships.
- Validation reports parse/meta-schema errors, missing contract links, draft
  schemas on active surfaces, and review obligations.

## Migration

Canvas documents move from schema version 2 to 3 and Systems canvases to profile
version 5 on read. Imported `.canvas` files run through the same migration.

Cards:

- service, external system, queue, API, database -> System with kind service,
  external, queue, api, or database
- process -> System with kind job
- event -> Schema with kind event; the old version is kept, or `1` when absent
- requirement, decision, risk -> Note with kind question, decision, or risk
- old title -> name; responsibility -> purpose; deployment URL, docs URL, and
  console URL -> url

Lines:

- describes (Schema -> System) -> defines with endpoints swapped
- publishes, emits -> produces
- every other removed line type -> uses
- Raw canvases keep their line types unchanged

Every removed field with a non-empty value is appended to the card's purpose or
note body as a `Label: value` line instead of being lost. Missing defaults are
dropped. No edge is dropped; an edge that breaks a v5 rule stays on the canvas
and appears as a Review issue.
