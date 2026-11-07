# Systems Profile Contract

Status: Implemented v2
Profile ID: `systems`
Version: `2`
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
| System | Runtime behaviour | Application, service, worker, CLI, queue, platform, frontend |
| Repository | Source code location | GitHub, GitLab, local, other |
| API | Contract and access surface | HTTP, GraphQL, gRPC, event, webhook, CLI |
| Database | Durable state | Relational, document, object, cache, search, warehouse |
| Actor | Human responsibility | Person, role, team |
| Process | Coordination | Manual, automated, hybrid |
| Artifact | Versioned deliverable | Manifest, container, model, config, schema, dataset, document |

Annotations: Note, Decision, Risk.

## Default Fields

| Card | Fields |
| --- | --- |
| System | Name, Purpose, Kind, Owner, Deployment URL, Status |
| Repository | Name, Provider, URL, Default branch, Owner, Status |
| API | Name, Purpose, Protocol, Owner, Docs URL, Status |
| Database | Name, Purpose, Kind, Owner, Console URL, Status |
| Actor | Name, Kind, Responsibility |
| Process | Name, Purpose, Mode, Owner, Runbook URL, Status |
| Artifact | Name, Kind, Version, URI, Digest, Owner, Status |
| Decision | Title, Status, Rationale, Owner |
| Risk | Title, Severity, Owner, Mitigation, Status |
| Note | Name, Body |

Field choices:

- System Kind: application, service, worker, CLI, queue, platform, frontend
- Repository Provider: GitHub, GitLab, local, other
- API Protocol: HTTP, GraphQL, gRPC, event, webhook, CLI
- Database Kind: relational, document, object, cache, search, warehouse
- Actor Kind: person, role, team
- Process Mode: manual, automated, hybrid
- Artifact Kind: manifest, container, model, config, schema, dataset, document
- Status: planned, active, deprecated unless the card defines its own statuses

## Relations

| Relation | Allowed source -> target |
| --- | --- |
| `exposes` | System -> API |
| `calls` | System -> API |
| `stores_in` | System -> Database |
| `depends_on` | System -> System |
| `runs` | Actor or System -> Process |
| `orchestrates` | Process -> System, API, or Database |
| `produces` | System or Repository -> Artifact |
| `uses` | System or Process -> Artifact; System -> Repository; Actor -> System |
| `relates_to` | Annotations ↔ anything; architecture -> annotations |

Default relation selection:

- System -> API: `exposes`
- System -> Database: `stores_in`
- System -> System: `depends_on`
- System -> Process: `runs`
- Actor -> Process: `runs`
- Actor -> System: `uses`
- Process -> System/API/Database: `orchestrates`
- System -> Artifact: `produces`
- System -> Repository: `uses`
- Repository -> Artifact: `produces`
- Annotation -> anything: `relates_to`

## Open Linking

Any two content cards can be connected. A relation type is optional.

- New Systems edges default to **Unspecified** and display **Define relation**.
- The relation picker lists every Systems relation, not only compatible ones.
- Choosing a relation that is invalid for the source and target is allowed.
- The UI flags an unspecified or invalid relation through the validation tray.
- Invalid connections are never blocked.
- Checking groups remain invalid because groups are not graph endpoints.

## Validation

Warnings do not block saving.

- Untyped text cards are warnings.
- Unknown entity or relation types are warnings.
- Missing required fields are warnings.
- Invalid source/target relation pairs are warnings.
- Group endpoints are warnings.
- Every content card has a title or name.
- Artifact identity is recommended through URI and digest.

## Layout

- Cards use the existing canvas card renderer.
- Properties appear above the note/content preview.
- The whole card outline is the connection handle.
- Double-click a card edge to fit it to its content.
- Groups remain visual boundaries and are not semantic endpoints.
- Capability and product boundaries can use groups instead of card types.

## Legacy

The previous detailed types remain readable in Raw canvases:

`service`, `queue`, `event`, `external_system`, `requirement`, `comment`, and
`code`.

Systems canvases migrate them as follows:

- service, queue, external system, repository -> System with a mapped kind
- event -> API with protocol event
- requirement, comment, code -> Note
- reads_from and writes_to -> stores_in
- calls and contains -> depends_on when both endpoints are Systems
- unsupported group and annotation edges are dropped during migration

Migration updates the canvas profile metadata to version 2 and preserves labels,
positions, groups, and unknown extension fields.
