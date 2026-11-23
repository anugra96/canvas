# City Model

Status: Proposed (draft 2026-11-21); Districts decided 2026-11-23, in progress
Applies to: Systems canvases first; API and Database canvases through links

## Decision

A Systems canvas is a map of a software system, read like a city map. The
goal is intuitive ways to navigate that map, and tools that help the user plan
and validate a reliable system before implementing it.

The city is an internal design language first. It names the model, the Review
rules, and the layout behaviour so they fit one picture. The UI keeps plain
systems words. A visible **Map mode** (map styling, landmark icons, city words)
is a later experiment, built on the same rules.

Every new rule, field, or layout behaviour in this area gets a city name in
this file, so Map mode later is a reskin, not a redesign.

## Glossary

### Places

| City | Canvas today | Gap |
| --- | --- | --- |
| Landmark (holds state) | System kind `database` or `queue` | No pinning |
| Building (does work) | System kind `service`, `api`, `worker`, `job`, `cli` | — |
| Gate (public entrance to a district) | System kind `api`, or a `queue` | Not distinguished from internal services |
| Border crossing, foreign city | System kind `external` | — |
| Workshop | Repository | — |
| Cargo | Artifact | — |
| Building code, customs standard | Schema | — |
| Residents and authorities | Actor | — |
| Survey markers | Note: `risk` hazard sign, `decision` permit on file, `question` survey flag | — |
| District | Group | Groups are not semantic today |
| Neighbouring map | Linked API or Database canvas | Levels Step 2 |

### Routes

| City | Canvas today | Gap |
| --- | --- | --- |
| Road network | `flow` class: `uses` | No sync or async distinction |
| Freight delivery | `flow` class: `produces` | — |
| Customs and law | `contract` class | Routes between Systems carry no manifest |
| Security checkpoint | `access` class: `authenticates_via` | API canvases only |
| Land registry | `structure` class: `defines`, `contains` | — |
| Signposts | `annotation` class: `relates_to` | — |
| Transit map, timetable | Data flow and Sequence views | Sequence order is inferred |

### Law and order, and map reading

| City | Canvas today |
| --- | --- |
| Patrol | A Review rule (one issue code, one tier) |
| City services | Fixes tab |
| Variance permit | Ignore with reason |
| Settlement, zoning, occupancy permit | Review modes Sketch, Design, Publish |
| Zoom: region, city, district, building plans | Levels 1 to 4 |
| Map layers | Display presets and edge classes |
| Urban planner | Auto layout (see `docs/urban-planner.md`) |

## Model changes (proposed)

| Change | Shape | Why |
| --- | --- | --- |
| District | `app.district: true` on a group, optional owner Actor id | Only districts take part in zoning rules; plain groups stay visual |
| Manifest | Optional `schemaRef` on a `uses` or `produces` edge between Systems | The named Schema is the route's checkpoint, drawn on the route |
| Pin | `app.pinned: true` on a card | Landmarks do not move by accident |
| Stage | `stage` field on System and Artifact: `planned`, `building`, `live`, `retired`; absent means `live` | Plan before building; planned cards draw dashed |
| City form | `app.cityForm` on the canvas root; absent means Unplanned | Selects form-specific rules, beside `app.reviewMode` |

No migration. Old canvases open unchanged.

## Districts (decided 2026-11-23, Phase 3 run 1)

| Decision | Choice | Why |
| --- | --- | --- |
| Shape | A group with `app.district: { ownerId?: string }`; `ownerId` is an Actor card id. No new card type, no migration | Districts are land, not buildings; edges to groups are already an integrity error |
| Membership | The planner's rule, one shared function: explicit `app.groupMembers`, else the smallest raw group holding the card's centre. A card's district is its nearest district ancestor | Zoning and Replan must agree on who lives where |
| Gates | System kinds `api` and `queue` | A queue used by several districts is a normal entrance, not a shared landmark |
| Landmarks for `shared_landmark` | System kind `database` only | Distributed: services own their data |
| When rules run | Systems canvases with at least one district; no city-form setting yet (Phase 4) | Canvases without districts stay quiet |
| Landmark look | Database and queue System cards get their own icon | First step toward Map mode; display only |
| Levels | Unchanged in this run. A database used by one System folds into it at Level 2; a shared database stays at Level 1 | Districts do not take part in Levels yet |

This run builds `unzoned_card`, `district_without_owner`, `shared_landmark`,
and `route_bypasses_gate`. The other rules below wait for manifests and forms.

## Rules (proposed)

All rules are Review issues with a tier, so Sketch stays quiet and only
Publish blocks export. A new code needs an `ISSUE_TIERS` entry as today.

| Group | Rule | Code | Tier |
| --- | --- | --- | --- |
| Placement | Two Systems with the same name and kind | `duplicate_landmark` | design |
| Zoning | A System outside any district, once the canvas has districts | `unzoned_card` | publish |
| Zoning | A district with no owner | `district_without_owner` | publish |
| Zoning | A database or queue used from more than one district (form-dependent) | `shared_landmark` | design |
| Routing | A route from another district goes straight to a database or internal service, not a gate | `route_bypasses_gate` | design |
| Routing | A route crossing a district border names no Schema | `route_without_manifest` | publish |
| Routing | A System with no routes | `isolated_card` | design |
| Routing | A `uses` cycle between districts | `district_cycle` | design |

Placement behaviour (positions are addresses, views keep geography) is
specified in `docs/urban-planner.md`.

## City forms

| Form | Architecture | Turns on | Relaxes |
| --- | --- | --- | --- |
| Unplanned (default) | Sketch or legacy discovery | Placement and `isolated_card` only | Every form rule |
| Central plan | Monolith, modular monolith | `district_cycle` | `shared_landmark`, `route_bypasses_gate` |
| Distributed | Services owning their data | `shared_landmark`, `route_bypasses_gate`; `route_without_manifest` at design tier | — |
| Hub and spoke | Event-driven around a broker | Cross-district routes go through the hub queue | Direct cross-district `uses` warns |
| Federated | Separate teams or linked canvases | Owners per district; cross-city routes go to `external` or a linked canvas | Rules apply per district |

A siloed city is not a form. Review reports it when districts have no routes
between them or duplicate a landmark.

## Navigation

| Navigation | Built on |
| --- | --- |
| Zoom out and in | Levels and Expand |
| Go to a landmark or district by name | Command menu |
| Map layers | Display |
| Follow a route hop by hop | Data flow and Sequence views |
| Impact study: what depends on this landmark | New; reverse walk over `uses` |
| Enter a district's own canvas, breadcrumb back | Canvas links, Levels Step 2 |
| Minimap with districts as land | New |
| Review issues as markers on the map | Review **Show** |

All of these depend on stable geography: a card is found where it was left.

## Planning order

1. Survey: Actors and `external` Systems.
2. Zone: districts with owners.
3. Place landmarks: databases and queues, pinned.
4. Build roads: `uses` and `produces`, gates at borders.
5. Post the law: Schemas as checkpoints on cross-district routes.
6. Get the permit: Publish, then export OpenAPI, DDL, and view images.

The Review **Views** section can show these steps the way it shows level
readiness.

## Phases

| Phase | Work | Gate |
| --- | --- | --- |
| 1 | This glossary | Agreed mapping |
| 2 | Stable geography and the urban planner (`docs/urban-planner.md`) | Same canvas gives the same relative positions in every view |
| 3 | Districts, manifests, zoning and routing rules | Rules run on `examples/` without noise |
| 4 | City form, stage, pins | — |
| 5 | Map mode experiment: a Display preset plus a theme | Reads better than Standard on two real canvases |

## Open questions

- Districts as a group flag (proposed) or a new card type.
- Manifests on the edge (proposed) or a Schema card linked by `uses`.
- Default city form for new canvases: Unplanned, or a choice at creation.
- Whether `stage` belongs here or with `docs/deployment-platform.md`.
