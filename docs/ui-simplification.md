# UI simplification spec

Status: approved 2026-11-10. This spec is the input to Phase 3 in
[`architecture-review.md`](architecture-review.md). Phase 3 implements this command set; it does not
refactor controls that this spec removes.

## Why

Measured on `7644e23` at 1440×900, on a Systems canvas:

- 21 controls sit above the canvas, in 3 rows that take 174 px (19% of the height).
- On a 375 px phone the top bar makes the page 474 px wide, so the whole page scrolls sideways.
- An edge's relation can be changed only from the main toolbar. The same dropdown silently switches
  between "New edge" and "Edge relation" depending on what is selected.
- The Layout menu has a "Data flow" option that moves cards. The Views dialog has a "Data flow" view
  that only shows them. The two share a name but behave differently.

Goal: one row of chrome, about 9 controls, no sideways scrolling, and one command list that drives
every surface. Non-goals: no new features, no theme or backdrop changes, no change to the stored canvas
format or the API.

## Target layout

Editor (desktop), one row of about 56 px:

```text
← Canvases / Model Delivery — Redesign ✎  [Systems] ● Saved     [+ Add ▾] [Views] [Review 2]     ↶ ↷  ⋯  🎨  (LD)
```

Canvas list page: brand on the left, then Appearance and the avatar menu on the right.

Phone (≤ 720 px), editor: `←  Title…  ● ` on the left, `[+]  [⋯]` on the right. The ⋯ sheet holds
every other command from the same list. The global brand bar is hidden inside the editor on phones.

## Command list

This table is the source for the Phase 3 command registry. Each command is defined once, with its id,
label, icon, shortcut, availability, and handler. The desktop bar, phone sheet, shortcuts dialog, and
help all read from the registry.

| Id | Label | Placement | Shortcut | Available | Handler today |
| --- | --- | --- | --- | --- | --- |
| `back` | Canvases / Back | bar, left | — | always | `back` |
| `rename` | Rename canvas | bar, title ✎ | — | always | `renameCanvas` |
| `add.note` | Note | Add menu | — | Systems | `addNoteAtCenter` |
| `add.card` | Text card | Add menu | — | Raw | `addAtCenter` |
| `add.entity.<type>` | One per card type | Add menu | — | per profile | `addEntityAtCenter` |
| `add.process-canvas` | Process with canvas | Add menu | — | Systems | `addProcessWithCanvas` |
| `views` | Views | bar | — | Systems | `setViewsOpen` |
| `review` | Review (count) | bar | — | Systems | merged panel, below |
| `undo` / `redo` | Undo / Redo | bar icons | ⌘Z / ⇧⌘Z | always | `undo` / `redo` |
| `save` | Save now | no button | ⌘S (new) | always | `save` |
| `layout.tidy` | Tidy layout | ⋯ menu | — | always | `autoLayout` |
| `layout.fit-cards` | Fit cards to content | ⋯ menu | — | always | `autoFitAll` |
| `view.fit` | Zoom to fit | ⋯ menu | ⇧1 | always | `fitCanvas` |
| `export.canvas` | Download .canvas | ⋯ menu | — | always | `download` |
| `export.image` | Screenshot | ⋯ menu | — | always | `setScreenshotOpen` |
| `help.shortcuts` | Keyboard shortcuts | ⋯ menu | ? | always | `setHelpOpen` |

The selection toolbar keeps its own contextual commands. It gains `edge.relation` (below).

## Changes

### Removed

| Control | Replacement | Code that goes away |
| --- | --- | --- |
| Layout dropdown | `layout.tidy` and `layout.fit-cards` in ⋯ | The "Data flow" option, `dataFlowLayout`, `dataFlowLayoutCanvas`, and its test. The Data flow view covers this without moving cards. |
| Edges path-style select | Appearance popover | Toolbar field only. Keep the `canvas-edge-style` storage key so saved choices survive. |
| New edge / Edge relation select | `edge.relation` in the selection toolbar | `newRelationType` state. New edges use the profile default: unspecified with the "Define relation" label on Systems, `relates_to` on Raw, as today. |
| Save button | Autosave, plus ⌘S | The button. Keep `save()`. ⌘S calls it and prevents the browser's save dialog. |
| Separate ✨ Intelligence and Warnings buttons | One `review` button | `validationPanel: 'warnings' \| 'intelligence'` becomes one panel with a tab. |
| Floating backdrop toggle in the canvas corner | Appearance popover | The corner button and its CSS. |
| Theme, ambience, and volume in the global bar | Appearance popover | Three bar controls. |
| User chip, Local mode badge, sign-out icon | Avatar menu | Three bar elements. |
| Separate `MobileToolbar` tree | The same command list rendered as a sheet | The duplicated mobile JSX in `CanvasToolbar.tsx`. |

### Edge relation in the selection toolbar

- When one or more edges are selected, the selection toolbar shows a Relation select next to Reverse,
  colour, and Delete.
- With several edges selected, it shows the shared relation, or "Mixed" when they differ. A choice
  applies to every selected edge as one undoable change, using `applyRelationToFlowEdge`.
- Systems canvases list the profile's allowed relations plus Unspecified; Raw canvases list all relations.

### Review panel

- One button labelled with the issue count (errors shown in red, warnings in amber, "Valid" when none).
- It opens one panel with two tabs: **Issues** (today's Warnings list) and **Fixes** (today's suggested
  fixes). The panel remembers the last tab during the session.
- Clicking a warning badge on a card or edge opens the panel on **Issues** at that issue, as today.

### Appearance popover

Theme, Backdrop on/off (shown only when the theme has a backdrop), Ambience with volume, and Edge path
style. All values keep their current storage keys.

### Avatar menu

Display name, email, a "Local mode" line when mock auth is on, and Sign out.

## Acceptance

- Desktop 1440×900 on a Systems canvas: at most 10 interactive controls above the canvas, and the canvas
  starts at or above 72 px.
- No horizontal page overflow on the list page or the editor at 320, 375, and 390 px widths:
  `document.documentElement.scrollWidth <= innerWidth`.
- Every command in the table is reachable on desktop and on phone, by mouse and by keyboard. Menus and
  popovers have accessible names, close on Escape, and return focus to their trigger.
- Changing a selected edge's relation works from the selection toolbar, and undo restores it.
- No change to stored canvases. Existing edges keep their relations and labels.
- `make verify` passes. The README sections on Layout, edge styles, the toolbar, and the Warnings and
  Intelligence panels describe the new UI.

## Tests

Follow the workspace test policy: protect named risks only.

- Update the E2E tests that drive removed controls: `name: 'Save'` (canvas, mobile), `Canvas layout`
  (canvas), `Edge path style` (themes), `Edge relation` (canvas), `Canvas intelligence` and
  `Systems validation` (canvas), `Toggle animated backdrop` and `Background ambience` (themes),
  `Add template` (canvas, schema, mobile), `More editor actions` and `Screenshot` (mobile, screenshots).
- Add one table-driven E2E test for no horizontal overflow at 320, 375, and 390 px on the list page and
  the editor. This risk is real today and nothing covers it.
- Add one E2E test that changes a selected edge's relation from the selection toolbar and undoes it.
- Delete `autoLayout.test.ts` cases for `dataFlowLayoutCanvas` with that function.

## Revised Phase 3 order

Commit each step with `make verify` green.

1. Remove the controls marked removed above, along with their state and code. This shrinks
   `CanvasEditor.tsx` before anything is extracted.
2. Build the command registry from the table, and render the desktop bar and the phone sheet from it.
   Delete `MobileToolbar`.
3. Add the Appearance popover, the avatar menu, the merged Review panel, and the edge relation select.
4. Continue the editor split from `architecture-review.md`: `document/`, `graph/`, `capture/`,
   `links/`, then `validation/`.
5. Rebuild the Docker stack and check the editor on desktop and on a phone width in a browser.

Stop and ask before removing any command not listed as removed here, or before changing how a
remaining command behaves.
