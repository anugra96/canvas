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
| 1 | Districts and zoning: `app.district` with an owner Actor; `unzoned_card`, `district_without_owner`, `shared_landmark`, `route_bypasses_gate`; Distributed rules only; database and queue icons | `city-model.md` (Districts) | — | In progress (opencode, 2026-11-23). Levels unchanged: a shared database already sits at Level 1; only the stale `level_unassigned` help text is fixed |
| 2 | API Phase 4 and Database Phase 4: Systems and districts link to API and Database canvases | `api-profile.md`, `database-profile.md` | 1 | "Neighbouring map" in the city glossary |
| 3 | Levels Step 2: drill into linked API and Database canvases | `levels.md` | 2 | "Enter a district's own canvas, breadcrumb back" |
| 4 | Manifests (`schemaRef` on cross-district routes), pins, `stage` | `city-model.md`, `urban-planner.md` Step 2 | 1 | `stage` open question: here or `deployment-platform.md` |
| 5 | Other city forms, then the Map mode experiment | `city-model.md` | 4 | Add a form only when a real canvas needs it |

## Beside the main line

Different files from Next 1 and 2, so these can run in parallel.

| Item | Spec | Note |
| --- | --- | --- |
| Database Phase 2: checks | `database-profile.md` | |
| Header: the Systems pill overlaps **Add** at 1280 px wide | — | Small |
| Views dialog: zoom to fit on open; Replan preview ghosts faint on the dark theme | `urban-planner.md` | Small, found in Step 1 review |
| Schema builder follow-ups: job System schemas, suggest schema from rows, array sub-tables | `schema-builder.md` | |

## Parked

| Item | Spec | Waiting for |
| --- | --- | --- |
| Auth: Postgres sessions, workspaces | `auth.md` | Security review (Aegis) |
| MCP tools | `mcp-plan.md` | Ready to unpark: `planLayout` is built and gives MCP the same placement |
| Deployment platform | `deployment-platform.md` | Decision on `stage` (Next 5) |
| Database Phase 3: migration diff | `database-profile.md` | Phase 2 |
| Codex as a user: Track A evaluation | — | Deferred |

## Built

| Item | Spec | Commits |
| --- | --- | --- |
| Local CI/CD: pre-push `make verify` hook, `make deploy-local` with rollback and start-up check | `README.md` | `ef2b111` |
| Urban planner Step 1: `planLayout` place and replan, Replan preview, seeded derived views, prod chunk fix | `urban-planner.md` | `dd6b745`, `d59b203`, `9e21876`, `efb50e2`, `61f5bb7`, `0334aa4`, `7d5063e` |
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
