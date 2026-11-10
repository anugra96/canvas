# Systems Profile Contract

Status: Implemented v4
Profile ID: `systems`
Version: `4`
Scope: `container`

## Decision

Systems is the minimal systems-design and architecture-review profile. It keeps
runtime, contract, state, people, coordination, and supply-chain objects as
separate responsibilities without exposing every implementation subtype.

Raw remains the freeform escape hatch. Pipeline execution remains a separate
future profile.

## Core Cards

| Card | Responsibility | Examples |
| --- | --- | --- |
| System | Runtime, API, database, CLI, or worker | Service, API, database, CLI, worker |
| Repository | Source code location | GitHub, GitLab, local, other |
| Actor | Human responsibility | Person, role, team |
| Process | Coordination | Manual, automated, hybrid |
| Artifact | Versioned deliverable | Manifest, container, model, config, dataset, document |
| Schema | Versioned contract | JSON Schema for API payloads, databases, events, config, datasets |

Annotations: Note, Decision, Risk.

## Default Fields

| Card | Fields |
| --- | --- |
| System | Name, Purpose, Kind, Owner, Deployment URL, Status |
| Repository | Name, Provider, URL, Default branch, Owner, Status |
| Actor | Name, Kind, Responsibility |
| Process | Name, Purpose, Mode, Owner, Runbook URL, Status |
| Artifact | Name, Kind, Version, URI, Digest, Owner, Status |
| Schema | Name, Contract kind, Version, Owner, Status, Review status, Reviewed version, Last reviewed, Review interval, JSON Schema |
| Decision | Title, Status, Rationale, Owner |
| Risk | Title, Severity, Owner, Mitigation, Status |
| Note | Name, Body |

Field choices:

- System Kind: service, API, database, CLI, worker
- Repository Provider: GitHub, GitLab, local, other
- Actor Kind: person, role, team
- Process Mode: manual, automated, hybrid
- Artifact Kind: manifest, container, model, config, schema, dataset, document
- Status: planned, active, deprecated unless the card defines its own statuses

## Relations

| Relation | Allowed source -> target |
| --- | --- |
| `runs` | Actor, System, Repository, or Process -> Process |
| `uses` | Actor, System, or Process -> System, Repository, Artifact, or Schema; Schema -> Schema |
| `produces` | System, Repository, or Process -> Artifact |
| `defines` | Repository or System -> Schema |
| `describes` | Schema -> System with kind API or database |
| `relates_to` | Annotations ↔ anything; architecture -> annotations |

Default relation selection:

- Actor or Repository -> Process: `runs`
- System or Process -> System: `uses`
- System -> Artifact: `produces`
- Repository -> Artifact: `produces`
- Process -> Artifact: `produces`
- System or Repository -> Schema: `defines`
- System/Process -> Schema: `uses`
- Schema -> System: `describes`

## Open Linking

Any two content cards can be connected. A relation type is optional.

- New Systems edges default to **Unspecified** and display **Define relation**.
- The relation picker lists every Systems relation, not only compatible ones.
- Choosing a relation that is invalid for the source and target is allowed.
- The UI flags an unspecified or invalid relation through the validation tray.
- Invalid connections are never blocked.
- Checking groups remain invalid because groups are not graph endpoints.

## Validation

Warnings do not block saving. **Canvas intelligence** and **Warnings** are
separate panels. Canvas intelligence shows suggested fixes without warning
codes or detailed messages. Each suggestion has a short context line, optional
**Show** to zoom to the affected area, and **Fix** to apply the change as one
undoable edit. Fix works before or after Show. The Warnings panel is a minimal
grouped list with ambiguous relation controls and ignored items.

- Relation warnings offer only relations allowed for the card-type pair. If the
  forward direction has no legal relation, the panel can reverse the edge and
  set a legal relation in one action.
- Safe bulk fixes apply only when a missing relation has one legal choice or the
  edge label exactly matches a legal relation. The panel previews every change
  and applies the batch as one undoable edit.
- Ignored warnings require a reason. They are stored in the canvas metadata and
  can be restored from the Ignored filter.
- The MVP semantic checks are limited to two rules. An Artifact needs a producer
  from a System, Process, Repository, or API. A Process needs a runner from an
  Actor or System.
- Canvas intelligence only suggests the two MVP semantic repairs: add a producer
  card for an Artifact or add a runner card for a Process. Every other warning
  remains manual.
- Untyped text cards are warnings.
- Unknown entity or relation types are warnings.
- Missing required fields are warnings.
- Invalid source/target relation pairs are warnings.
- Group endpoints are warnings.
- Every content card has a title or name.
- Artifact identity is recommended through URI and digest.
- JSON Schema contracts are parsed and meta-validated.
- Active API and database Systems should have a linked schema contract.

## Layout

- Cards use the existing canvas card renderer.
- Properties appear above the note/content preview.
- The whole card outline is the connection handle.
- Double-click a card edge to fit it to its content.
- Groups remain visual boundaries and are not semantic endpoints.
- Capability and product boundaries can use groups instead of card types.

## Schema contracts

Schema is a first-class contract, not an Artifact kind. Artifact is a concrete
versioned deliverable; Schema is the normative structure shared across components.

- JSON Schema is the first supported format. Draft-07, 2019-09, and 2020-12
  meta-validation are supported where the bundled Ajv validator supports them.
- The Schema card source is authoritative so the outline, validation, and review
  feedback remain synchronized.
- `defines` connects repositories or systems to schemas they own.
- `describes` connects a schema to the API or database System it governs.
- `uses` declares that a system, process, or schema consumes a schema contract.
- Schema-to-schema `uses` records ERD/foreign-key relationships.
- Validation reports parse/meta-schema errors, missing contract links, draft
  schemas on active surfaces, and review obligations.

## Legacy

The previous detailed types remain readable in Raw canvases:

`service`, `queue`, `event`, `external_system`, `requirement`, `comment`, and
`code`.

Systems canvases migrate them as follows:

- service, queue, external system, repository -> System with a mapped kind
- event -> System with kind API
- requirement, comment, code -> Note
- reads_from and writes_to -> uses
- calls, exposes, depends_on, orchestration, storage, and references -> uses
- unsupported group and annotation edges are dropped during migration

Migration updates the canvas profile metadata to version 4 and preserves labels,
positions, groups, and unknown extension fields. API and database cards become
System cards with kind `api` or `database`.
