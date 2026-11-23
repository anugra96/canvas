# Stable Geography and the Urban Planner

Status: Proposed (draft 2026-11-21, not built)
Applies to: Systems canvases; API and Database layouts unchanged in Step 1
Context: `docs/city-model.md`

## Decision

A card's position is its address. Auto layout stops being a reflow that
rewrites every position and becomes an **urban planner**: it places new cards
well, and it proposes moves for placed cards that the user previews and
accepts. Derived views start from the canvas positions, so a System is found
in the same part of the map in every view and level.

```text
Insert card ──> Planner places it near what it routes to (no other card moves)
Tidy / Replan ──> Planner proposes moves ──> Preview ──> Apply (one undo) | Cancel
Derived view ──> Seed from canvas positions ──> Remove overlaps ──> Draw
```

## Today

Confirmed in code at `337409c`:

- `autoLayoutCanvas` (`web/src/canvas/model/autoLayout.ts`) runs dagre `LR`
  over every non-group card and replaces every position. Groups are left
  where they are while their cards move, so a tidy canvas loses its groupings.
- `useCanvasLayout.autoLayout` applies it to the whole canvas with the notice
  "Architecture layout applied." It applies with no preview.
- `layoutDerivedView` (`web/src/canvas/views/diagramLayout.ts`) runs a fresh
  dagre pass on every open. Canvas positions are ignored, so the same System
  sits in a different place in Runtime, Data flow, and each Level.
- `findPlacementPosition` (`web/src/canvas/editor/graph/placement.ts`) finds
  the nearest free slot around a base point. It does not consider relations
  or groups.

## Planner

One pure module in the contract package, `planLayout`, shared by the web app,
Fixes, and future MCP tools. No React.

```ts
type LayoutScope =
  | { kind: 'place'; nodeIds: string[] }      // new cards only
  | { kind: 'tidy'; groupId: string }         // one district
  | { kind: 'replan' }                        // whole canvas

interface LayoutMove { id: string; from: Point; to: Point; reason: string }
interface LayoutPlan { moves: LayoutMove[]; groupResizes: GroupResize[] }

function planLayout(canvas: JsonCanvas, scope: LayoutScope, sizes: Sizes): LayoutPlan
```

### Laws the planner keeps

| Law | Detail |
| --- | --- |
| Placed cards stay | In `place` scope, only the listed cards move |
| Pinned cards never move | `app.pinned: true`; in every scope. Until pins exist, nothing is pinned |
| Groups move with their cards | A move of a group's members moves or grows the group; a card never leaves its group by layout |
| Flow reads one way | `flow` edges run left to right inside a district and between districts, as dagre `LR` does today |
| Small moves win | Among equal layouts, prefer the one with the least total displacement from current positions |
| Deterministic | Same canvas, scope, and sizes give the same plan |

### Scopes

| Scope | When | What moves |
| --- | --- | --- |
| `place` | A card is added by the user, a Fix, a template, or import of a single card | The new cards. Base point = centre of the cards it connects to; inside their shared group if there is one; then `findPlacementPosition` for a free slot |
| `tidy` | **Tidy group** on a selected group | That group's members, laid out with dagre inside the group; the group grows to fit. Cards outside are untouched |
| `replan` | **Replan layout** command | Groups are laid out as blocks by their cross-group edges, then members inside each block. Ungrouped cards are treated as one block |

### Preview

`tidy` and `replan` never apply directly.

- The canvas shows ghost outlines at the proposed positions with thin lines
  from current to proposed.
- A bar shows `12 cards move` with **Apply** and **Cancel**. Escape cancels.
- **Apply** writes all moves and group resizes as one undoable edit.
- `place` applies without preview: it moves nothing the user placed.

## Derived views keep geography

`layoutDerivedView` gains a seeded mode, the default for Systems canvases:

1. Each view card takes the position of the canvas card it stands for. A folded
   card (Levels) takes its owner's position; a merged card takes the mean of
   its members.
2. Positions are scaled to the view's card sizes, keeping relative order on
   both axes.
3. A minimal-displacement pass removes overlaps, keeping order.
4. Edges are routed as today with `edgeGeometry`.

Dagre stays as **Auto arrange** in the Derived views dialog, and as the
fallback when the canvas has no usable positions (all cards at one point).
Seeded layout is deterministic, so export stays stable.

## Commands

| Command | Where | Replaces |
| --- | --- | --- |
| Replan layout | Toolbar and command menu | Auto layout on Systems canvases |
| Tidy group | Selection toolbar on a group | — |
| Auto arrange | Derived views dialog | — |
| Fit to window (on by default, never below 50%; export stays full size) | Derived views dialog | — |

API and Database canvases keep `layoutApiCanvas` and `layoutDatabaseCanvas`
in Step 1. They move onto the planner in Step 2.

## Steps

| Step | Scope |
| --- | --- |
| 1 | `planLayout` with `place` and `replan`; preview; groups move with cards; Fixes and inserts use `place`; seeded derived views |
| 2 | `tidy`; pins; API and Database layouts through the planner |
| 3 | City-form-aware plans (hub in the middle, gates on borders) after `app.cityForm` lands |

## Proof

| Risk | Proof seam |
| --- | --- |
| A placed card moves on insert | Table-driven `planLayout` test: `place` scope returns moves only for listed ids |
| A card leaves its group | Same test: after `replan`, every member is inside its group bounds |
| Plans are unstable | Same canvas twice gives an identical plan; a one-card edit changes few positions |
| Views lose geography | `derivedViews` test: for each view and level, the left-to-right and top-to-bottom order of shared cards matches the canvas |
| Overlaps | Every plan and seeded view has no overlapping cards |
| UI flow breaks | One E2E: Replan shows the preview, Cancel leaves positions, Apply moves cards, Undo restores |

## Contract changes

- `packages/canvas-contract`: `planLayout`, `LayoutScope`, `LayoutPlan`;
  optional `app.pinned` on cards (Step 2).
- No change to stored canvases. No migration.

## Decisions

| Decision | Choice | Strongest challenge |
| --- | --- | --- |
| Preview before moves | Yes for `tidy` and `replan` | One-click layout is faster; but silent reflow is what destroys geography, and Undo is found too late |
| Views seeded from canvas | Default on Systems | Dagre views are tidier on messy canvases; Auto arrange keeps that one click away |
| Planner in the contract | Yes | Layout is UI work; but Fixes, scripts, and MCP need to place cards the same way |
