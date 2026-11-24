---
name: canvas-ui
description: Drive the Canvas web app by hand, like a person, to create and edit canvases from scratch. Use when an agent must build or change a canvas through the real UI with Playwright or a browser tool, instead of importing a file or calling the API. Covers Systems (architecture cards and typed lines), API (OpenAPI resources, endpoints, schemas, security; export YAML), and Database (tables, keys, indexes, enums with a PostgreSQL target; export DDL).
---

# Canvas UI: build by hand

Build canvases through the real UI, one visible action at a time. Every action
uses an accessible role and an exact name or label. Verify each step on the
card before the next one. Never edit stored canvas JSON or call the API to
"help".

## Rules

1. **Target a safe app.** Use an isolated dev server with a temporary data
   directory (below). Do not create, edit, or delete canvases on a shared or
   production instance unless the user says so.
2. **Exact names only.** Always pass `exact: true`. `Add table` also matches
   `Close add table dialog` without it.
3. **Locate by role, label, or card name.** Never by CSS class, position, or
   screenshot coordinates. One exception: a card you just added is selected,
   so open it with `.react-flow__node.selected` before anything changes the selection.
   - Buttons and menu items: `getByRole('button' | 'menuitem', { name, exact: true })`.
   - Text fields and checkboxes: `getByLabel('<label>', { exact: true })`.
   - Selects: `getByRole('combobox', { name: '<label>', exact: true })`. Some
     select labels include their option text, so `getByLabel` misses them.
   - Cards: `getByRole('group', { name: '<Type> <name>', exact: true })`, e.g.
     `System Tasks API`, `Endpoint GET /tasks`, `Table app.task`. Names follow the
     saved fields, so a card's name changes when you rename it.
4. **Open a card editor** by double-clicking the card. For a lane (Schema,
   Resource), double-click its title (`header strong`), not its body: the body
   holds other cards.
5. **Edit, then Done.** Card editors close with `button "Done"`; the Database
   settings dialog closes with `button "Save"`. Read the card afterwards to
   confirm the change.
6. **The form refuses invalid edits silently or with an alert.** After Done,
   check the card. If a change is missing, read `getByRole('alert')` in the
   editor. Never retry blindly.
7. **One canvas, one profile.** The profile (Raw, Systems, API, Database) is
   chosen at creation and cannot change.
8. **Panels cover the toolbar.** Close `Review` (`button "Close review"`) and
   editors (`Done`) before you click the toolbar again. `Escape` does not
   close every editor.

## Start an isolated app

From the repository root:

```bash
DATA=$(mktemp -d) CANVAS_DATA_DIR=$DATA CANVAS_AUTH_MODE=local CANVAS_API_PORT=8788 npm run dev -w api
CANVAS_API_PORT=8788 npm run dev -w web -- --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/`. Wait for `button "New canvas"` before acting:
the first accessibility read after load can be empty.

## Create a canvas

| Step | Action |
| --- | --- |
| 1 | `getByLabel('Canvas type')` → select `database` (or `raw`, `systems`, `api`) |
| 2 | Click `button "New canvas"` |
| 3 | Dialog: fill `getByLabel('Canvas name')`, click `button "Create canvas"` |
| 4 | Wait for the URL `/canvas/<id>` and the empty canvas |

## Toolbar

| Control | Use |
| --- | --- |
| `button "Add"` | Menu of card types for this profile (`menuitem` per type) |
| `button "Display"` | Edge and label visibility presets |
| `button "More canvas actions"` | Replan layout for the profile (then `button "Apply"` in `region "Layout preview"`), `Fit cards to content`, `Zoom to fit`, export for the profile (`Export DDL`, `Export OpenAPI YAML`), `Download .canvas`, `Screenshot`, `Keyboard shortcuts`. Database `Export DDL` and `Copy DDL` need `Target: PostgreSQL` in Database settings |
| `menuitem "Database settings"` | Database canvases: open `dialog "Database settings"`; `combobox "Target"` chooses `PostgreSQL` (only selectable target today); `Save` updates the target and stored Database definition, creating the definition only when fields change. No Database card is drawn |
| `button "Add table here"` | In a Schema lane header: open Add table with that lane's schema filled in |
| `button "Connect"` | Shown when one card is selected (Raw, Systems): click it, then the target card |
| `combobox "Group owner"` | Shown when one group is selected (Systems, Ownership checks on): picks the owning Actor card; `No owner` makes it a plain group |
| `button "Ownership checks"` | Review header (Systems): turns group owners and ownership checks off or on for the canvas |
| `combobox "Endpoint"` | Shown for one selected `uses` line to an API System: picks the endpoint the call uses, or `No endpoint` |
| `button "Create or open API canvas"` | In an API System's editor: creates and links an API canvas, then opens it on the next click |
| `button "Create or open Database canvas"` | In a Database System's editor: creates and links a Database canvas, then opens it on the next click |
| `button "Review"` | Issues and level readiness; close with `button "Close review"` |
| `button "Fit View"` | Fit all cards in view. Use it before double-clicking a card that may be off-screen |
| `button "Undo"`, `button "Redo"` | Undo the last change |

## Recipes

Read the recipe for the profile before the first action. Each has a working
reference script that builds a full example by hand and checks the export.

| Profile | Recipe | Reference |
| --- | --- | --- |
| Systems | [recipes/systems.md](recipes/systems.md) | [build-simple-tasks-system.spec.ts](reference/build-simple-tasks-system.spec.ts) |
| API | [recipes/api.md](recipes/api.md) | [build-simple-tasks-api.spec.ts](reference/build-simple-tasks-api.spec.ts) |
| Database | [recipes/database.md](recipes/database.md) | [build-simple-tasks.spec.ts](reference/build-simple-tasks.spec.ts) |

## Verify the result

- **Cards:** read the card text. Table cards list `name type` per column with
  badges `PK`, `FK`, `UQ`, `NULL` (nullable), `IDX` (leads an index).
- **Any profile:** `More canvas actions` → `Download .canvas` saves pending
  edits, then downloads the canvas JSON. Cards: `nodes[].id`, `nodes[].app.entityType`,
  `nodes[].app.fields`. Lines: `edges[].fromNode` and `edges[].toNode` (card ids),
  `edges[].app.relationType`.
- **API export:** `Export OpenAPI YAML`. **Database export:** `Export DDL`.
  Compare by meaning, not text (key order, cast spelling, and quoting may differ).

## Known limits (check before you promise a result)

| Cannot do by hand today | Do instead |
| --- | --- |
| Functions, triggers, policies, grants, views | Only via `Import DDL`; they are kept read-only as Extra DDL |
| Remove the last column of a table | Edit it instead; the form shows "A table needs at least one column." |
| An empty API resource | `Add resource` always scaffolds five endpoints; delete the ones you do not need |
| A Systems database used by two systems at one level | Accept the "Unassigned at level" warning |
