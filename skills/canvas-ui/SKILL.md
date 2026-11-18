---
name: canvas-ui
description: Drive the Canvas web app by hand, like a person, to create and edit canvases from scratch. Use when an agent must build or change a canvas through the real UI (Database tables, columns, keys, indexes, enums, schemas; export DDL) with Playwright or a browser tool, instead of importing a file or calling the API.
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
   screenshot coordinates.
   - Buttons and menu items: `getByRole('button' | 'menuitem', { name, exact: true })`.
   - Form fields: `getByLabel('<label>', { exact: true })`.
   - Cards: `page.locator('[aria-label="<Type> <name>"]')`. Names are
     `Table <schema>.<table>`, `Enum <schema>.<enum>`, `Schema <name>`,
     `Database <name>`. Names follow the saved fields, so a card's name changes
     when you rename it or change its schema.
4. **Open a card editor** by double-clicking the card. For a Schema lane,
   double-click its title (`header strong`), not its body: the body holds tables.
5. **Edit, then Done.** Every editor closes with `button "Done"`. Read the card
   afterwards to confirm the change.
6. **The form refuses invalid edits silently or with an alert.** After Done,
   check the card. If a change is missing, read `getByRole('alert')` in the
   editor. Never retry blindly.
7. **One canvas, one profile.** The profile (Raw, Systems, API, Database) is
   chosen at creation and cannot change.

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
| `button "More canvas actions"` | `Tidy database layout`, `Fit cards to content`, `Zoom to fit`, `Export DDL`, `Copy DDL`, `Download .canvas`, `Screenshot`, `Keyboard shortcuts` |
| `button "Fit View"` | Fit all cards in view. Use it before double-clicking a card that may be off-screen |
| `button "Undo"`, `button "Redo"` | Undo the last change |

## Recipes

- Database profile (tables, columns, keys, indexes, enums, schemas, export):
  [recipes/database.md](recipes/database.md)
- Working reference: [reference/build-simple-tasks.spec.ts](reference/build-simple-tasks.spec.ts)
  builds `examples/simple-tasks-db.sql` entirely by hand.

## Verify the result

- **Cards:** read the card text. Table cards list `name type` per column with
  badges `PK`, `FK`, `UQ`, `NULL` (nullable), `IDX` (leads an index).
- **Database export:** `More canvas actions` → `Export DDL` downloads `<canvas>.sql`.
  Compare it with the intended design. Casts may be spelled differently
  (`'open'::app.task_status` exports as `CAST('open' AS app.task_status)`).

## Known limits (check before you promise a result)

| Cannot do by hand today | Do instead |
| --- | --- |
| Functions, triggers, policies, grants, views | Only via `Import DDL`; they are kept read-only as Extra DDL |
| Remove the last column of a table | Edit it instead; the form shows "A table needs at least one column." |
