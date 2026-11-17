# Canvas Backlog

Ordered. Specs are linked where they exist. Updated 2026-11-16.

## MVP in progress

| # | Item | Spec | State |
| --- | --- | --- | --- |
| 1 | Schema workbench: Fields, Rows, JSON tabs | `schema-builder.md` | Prompt sent to opencode |
| 2 | Embedded schemas on Artifact | `schema-builder.md` | Next |
| 3 | Levels Step 1, Review modes, View readiness | `levels.md` | After 2 |
| 4 | Bug round: user-reported bugs; `naming_inconsistent` mixes path segments, parameters, and properties (judge each category by its own majority style); importer drops path-level `parameters`/`summary`; `$ref` responses draw no arrow | — | After 3 |

## Next

### Edge classes and visibility

Problem: every canvas shows too many edges. Edges have no class, so the app
cannot choose which to show, and the user cannot pick a complexity level.

Draft model (to be specified):

| Axis | Values | Meaning |
| --- | --- | --- |
| Origin | `explicit` | Drawn by the user; editable as an edge |
| | `managed` | Derived from a field (API `accepts`/`returns`, DB `references`, `schemaRef`); edited through the card, `app.managed: true` today |
| | `inferred` | Exists only in a derived view (Levels lifted edges, `uses ×3`); never stored |
| Class | `structure` | Ownership and containment: `contains`, `defines`, group membership. Usually shown as nesting or levels, not lines |
| | `flow` | Runtime dependency and data movement: `runs`, `uses`, `produces`, `calls` |
| | `contract` | Payload and schema links: `accepts`, `returns`, `describes`, `references`, `schemaRef` |
| | `annotation` | `relates_to` from Notes, Decisions, Risks |

- Every relation type declares its class in the ontology; a contract test fails
  when one has none.
- One **Display** control replaces separate toggles: presets **Minimal** (flow
  only), **Standard** (flow and contract, default), **All**, plus per-class and
  per-card-type checkboxes. This absorbs the earlier **Layers** idea.
- View-only, like Layers: not saved into cards or edges; export is unchanged;
  Review still checks hidden edges; a chip shows `12 edges hidden`.
- Fits Levels: Levels decides which cards exist in a view; Display decides which
  edge classes are drawn.
- Existing API rules in `openapi/edgeVisibility.ts` (hide `contains`, 4xx/5xx
  `returns`, default security) become this model's per-profile defaults.

### Other

| Item | Spec | Note |
| --- | --- | --- |
| API Phase 4: Systems link to API canvas | `api-profile.md` | Needed for Levels Step 2 |
| Levels Step 2: drill into linked API and DB canvases | `levels.md` | After API and DB Phase 4 |
| Database profile: parser spike, then Phase 1 | `database-profile.md` | |
| Auth: Postgres sessions, workspaces | `auth.md` | Parked until its security review (Aegis) |
| Codex as a user: Track A evaluation | — | Deferred |
| Schema builder follow-ups: Process schemas, suggest schema from rows, array sub-tables | `schema-builder.md` | |
