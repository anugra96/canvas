# Levels, Review Modes, and View Readiness

Status: Proposed (draft 2026-11-16, not built)
Applies to: Systems canvases (Step 1); linked API and Database canvases (Step 2)

## Decision

The canvas is a free space where the user records cards and relations. Views
are derived from it automatically and are read-only. A **Level** control sets
how deep a view goes for the same system, from a context picture down to
contracts. Review tells the user which gaps block which view, and a per-canvas
**Review mode** sets how strict Review is.

```text
Canvas (user edits)  ──derive──>  View × Level (automatic, read-only)  ──>  Export PNG / SVG
        ▲                                   │
        └──── Review: "fix these to unlock Level 2" ◀───┘
```

Nobody assigns levels or parents by hand. Both come from card types and
relations that already exist.

## Levels

| Level | Name | Cards shown (Step 1, Systems profile) | Step 2 adds |
| --- | --- | --- | --- |
| 1 | Context | Actor, System | — |
| 2 | Containers | Repository, Process, Artifact; a System of kind `database` that exactly one other System uses | — |
| 3 | Components | — | API Resources and Database Tables from linked canvases |
| 4 | Contracts | Schema | Endpoints, API Schemas, columns |

- Level numbers are fixed. A level with no cards on this canvas is shown
  disabled with the text "No cards at this level".
- A view at level N shows every card with level ≤ N. Each hidden card folds
  into its nearest visible ancestor.
- The Level control applies to every derived view (Architecture, Runtime, Data
  flow, Contracts, Pipeline). The view chooses the aspect; the level chooses the
  depth. The Contracts view starts at level 4.

## Parents

A card's parent is chosen by the first rule that matches, in this order. If
several cards match one rule, the first by label, then id, wins, and the card
detail lists "also: <others>".

| Card | Parent, in priority order |
| --- | --- |
| Process | The System that `runs` it; else the Repository that `runs` it; else the Actor that `runs` it |
| Artifact | The Process that `produces` it; else the System; else the Repository |
| Repository | The System that `uses` it |
| Schema | The System or Repository that `defines` it; else the System it `describes`; else the only System or Process that `uses` it; else the Schema that `uses` it (it follows that Schema's parent) |
| Database System (folded) | The only System that `uses` it |
| Note, Decision, Risk | Not levelled. Shown as a count badge on the visible card they relate to (`2 risks`). A Risk with severity `high` gives a red badge |

Folding follows the chain: an Artifact produced by a Process that a System runs
folds into the System at level 1. A cycle stops at the first repeated card.

A hidden card with no parent chain to a visible card goes into one
**Unassigned (N)** card at the end of the view. Opening it lists the cards with
a **Show in canvas** action.

## Edges

1. Map each edge's ends to their nearest visible ancestors at the current level.
2. Drop an edge whose ends map to the same card. Count it as internal in that
   card's detail (`4 internal relations`).
3. Merge edges with the same ends and relation type into one, labelled with the
   count (`uses ×3`). Different relation types stay separate edges.

## Interaction

- **Level control:** a four-step segmented control in the Derived views dialog,
  next to the view tabs. Keyboard: `1` to `4`.
- **Folded card:** shows chips for what it contains (`3 processes · 2 artifacts ·
  5 schemas`) and an **Expand** button.
- **Expand one card:** shows that card's children one level deeper. Every other
  card stays at the current level. **Collapse all** resets. Expansion state is
  kept for the session only and is not saved in the canvas.
- **Export:** PNG and SVG of the current view, level, and expansion, reusing the
  capture code in `web/src/canvas/editor/capture/`. The export footer names the
  canvas, view, level, and date.
- Layout reuses `layoutDerivedView`. The same canvas, view, level, and expansion
  give the same positions.

## Review modes

One setting per canvas, saved in the canvas root as `app.reviewMode`:
`sketch`, `design` (default when absent), or `publish`. Rules do not change
between modes; only which issues are shown and what blocks export.

| Mode | Shows | Export of views, OpenAPI, or DDL |
| --- | --- | --- |
| Sketch | `integrity` issues only | Allowed |
| Design | `integrity` and `design` issues | Allowed |
| Publish | All tiers | Blocked while an issue is open; the export dialog lists them with **Show** and **Ignore with reason** |

Every issue code has one tier in a single table in the contract package
(`ISSUE_TIERS`). Severity (error or warning) is unchanged and still decides the
icon and order.

| Tier | Meaning | Initial codes |
| --- | --- | --- |
| `integrity` | The canvas or its export is broken | `schema_invalid`, `example_invalid`, `operation_invalid`, `ref_unresolved`, `operation_duplicate`, `path_parameter_mismatch`, `unknown_entity_type`, `missing_endpoint`, `group_endpoint`, and every Database Phase 2 error |
| `design` | The design is incomplete or a view cannot be built | `missing_relation_type`, `unknown_relation_type`, `relation_not_allowed`, `untyped_text`, `artifact_without_producer`, `process_without_runner`, `schema_unlinked`, `schema_contract`, `level_unassigned`, `response_success_missing`, `mutation_errors_missing`, `security_missing`, `get_with_body`, `endpoint_without_resource`, and Database Phase 2 warnings |
| `publish` | Polish expected before others rely on it | `missing_required_field`, `schema_review`, `list_pagination_missing`, `naming_inconsistent`, `schema_unused` |

A new issue code without a tier fails the contract test, so no rule is silently
hidden.

Ignored issues stay ignored in every mode. The Review header shows the mode as
a small selector, and the count of issues the mode hides (`7 hidden by Sketch`),
so a quiet panel is never mistaken for a clean canvas.

## View readiness

The Review panel gets a **Views** section above Issues:

```text
Views
  ✓ Level 1 Context
  ⚠ Level 2 Containers   3 cards unassigned
  ⚠ Level 4 Contracts    2 schemas unassigned
```

- A level is **ready** when no card at a deeper level is Unassigned at that
  level. Each unready level produces one `level_unassigned` issue per card
  (tier `design`, severity warning) with the message
  "<card> has no owner at <level>: add `defines`, `describes`, `runs`,
  `produces`, or `uses` from a System".
- Clicking a level opens the Derived views dialog at that level.
- No automatic fix: choosing an owner is a design decision.
- An unready view still renders. Gaps show as the Unassigned card; nothing is
  blocked except in Publish mode.

## Steps

| Step | Scope | Depends on |
| --- | --- | --- |
| 1 | Levels, parents, edge lifting, expand, export, Review modes, readiness, all inside one Systems canvas | API Phase 3 landed (shared Review and command code) |
| 2 | Levels 3 and 4 read linked API and Database canvases through canvas links; a System with a linked API canvas expands into Resources, then Endpoints and Schemas | API Phase 4, Database Phase 4 |

Step 2 loads linked canvases read-only and shows a "Linked canvas not
available" card when one cannot be read. It never edits a linked canvas.

## Proof

| Risk | Proof seam |
| --- | --- |
| Wrong parent or fold | Table-driven test in `derivedViews`: small canvases -> expected visible cards per level, parents, and Unassigned list |
| Edges lost or doubled | Same test: expected lifted edges, merge counts, and internal counts |
| A rule is hidden by mistake | Contract test: every `ProfileIssueCode` has a tier; table-driven test: mode -> visible codes |
| Publish does not block | One test: Publish mode with an open issue refuses export; ignoring it with a reason allows export |
| UI unreadable | Browser check on `examples/schema-contracts.canvas` at each level: no overlaps, the Unassigned card, Expand on one System, PNG export |

## Contract changes

- `packages/canvas-contract`: `reviewMode` on the canvas root `app`
  (optional, default `design`); `ISSUE_TIERS`; issue code `level_unassigned`;
  level and parent rules as a pure module so the web app and scripts share them.
- No change to stored cards or edges. No migration. Old canvases open in Design
  mode, which shows what they show today plus `level_unassigned`.

## Decisions

| Decision | Choice | Strongest challenge |
| --- | --- | --- |
| Where levels apply | Derived, read-only views | Hiding cards on the editable canvas feels more direct; but it leaves holes in a layout made for full detail and makes edits on hidden cards ambiguous. Layers covers editing-time hiding |
| Levels and parents | Derived from types and relations | Manual levels give control; but they drift and nobody maintains them. The Unassigned card and readiness show where the derivation lacks data |
| Strictness | Three modes with tiers | Per-rule toggles give finer control; but they hide important rules and are hard to test. Ignore-with-reason covers single exceptions |
| Publish blocks export | Yes, with Ignore with reason | Blocking can annoy; but Publish is opt-in, and the reason is recorded |
