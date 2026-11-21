# Canvas Backlog

Ordered. Specs are linked where they exist. Updated 2026-11-21.

## Direction: the city model

The Systems canvas is read as a city map: places keep their address, auto
layout proposes moves instead of reflowing, and Review rules cover districts,
gates, and route manifests. Internal design language first; a visible Map mode
later. Glossary and phases: `city-model.md`. Layout: `urban-planner.md`.

Rule for every new field (from `ontology-audit.md`): it ships in the same
change as the Review rule, planner law, or rendering that reads it.

## Next

| # | Item | Spec | After | Note |
| --- | --- | --- | --- | --- |
| 1 | Urban planner Step 1: `planLayout` with `place` and `replan`, preview, groups move with cards, inserts and Fixes use `place`, seeded derived views | `urban-planner.md` | — | **Replan layout** replaces **Tidy layout** on Systems: update `skills/canvas-ui` (SKILL.md, `recipes/systems.md`, reference script) in the same change |
| 2 | Districts and zoning: `app.district` with an owner Actor; `unzoned_card`, `district_without_owner`, `shared_landmark`, `route_bypasses_gate`; Distributed rules only | `city-model.md` | 1 | A database or queue used inside one district folds into that district. This closes the Levels gap: a database shared by two Systems has no level today, and the warning still says "Add an owner relation" (`validationPresentation.ts`) |
| 3 | API Phase 4 and Database Phase 4: Systems and districts link to API and Database canvases | `api-profile.md`, `database-profile.md` | 2 | "Neighbouring map" in the city glossary |
| 4 | Levels Step 2: drill into linked API and Database canvases | `levels.md` | 3 | "Enter a district's own canvas, breadcrumb back" |
| 5 | Manifests (`schemaRef` on cross-district routes), pins, `stage` | `city-model.md`, `urban-planner.md` Step 2 | 2 | `stage` open question: here or `deployment-platform.md` |
| 6 | Other city forms, then the Map mode experiment | `city-model.md` | 5 | Add a form only when a real canvas needs it |

## Beside the main line

Different files from Next 1 and 2, so these can run in parallel.

| Item | Spec | Note |
| --- | --- | --- |
| Database Phase 2: checks | `database-profile.md` | |
| Header: the Systems pill overlaps **Add** at 1280 px wide | — | Small |
| Schema builder follow-ups: job System schemas, suggest schema from rows, array sub-tables | `schema-builder.md` | |

## Parked

| Item | Spec | Waiting for |
| --- | --- | --- |
| Auth: Postgres sessions, workspaces | `auth.md` | Security review (Aegis) |
| MCP tools | `mcp-plan.md` | `planLayout` (Next 1) gives MCP the same placement |
| Deployment platform | `deployment-platform.md` | Decision on `stage` (Next 5) |
| Database Phase 3: migration diff | `database-profile.md` | Phase 2 |
| Codex as a user: Track A evaluation | — | Deferred |

## Built

| Item | Spec | Commits |
| --- | --- | --- |
| Systems v5: five cards, note kinds, four lines; schema v3 migration | `ontology-audit.md`, `systems-profile.md` | `c3c3202`, `c5c3fdb` |
| canvas-ui skill with Systems and API recipes | `skills/canvas-ui` | `7102789`, `42b799c`, `337409c` |
| Database Phase 1: model, DDL import and export | `database-profile.md` | `aa7b002`, `92d5588` |
| Edge classes and the Display control | `edge-classes.md` | `acd8a01`, `cd0fe92` |
| Levels Step 1, Review modes, view readiness | `levels.md` | `70685ac`, `e669947` |
| Schema workbench (Fields, Rows) and embedded schemas on Artifact | `schema-builder.md` | `7cd39be`, `5694a9c` |
| API Phases 1 to 3: model, import, design tools, review, breaking changes | `api-profile.md` | `aa92b9d`, `f1833bb`, `d8a4a94` |
| Focus tones and 432 Hz tuning | `focus-tones.md` | `d151305` |
| Bug round: per-category naming, path-level parameters, `$ref` response arrows | — | `e4fbf8b`, `4de7417`, `c170951` |
| CI on `main` green again: App create test waits for the lazy editor | — | `28a7d17` |
