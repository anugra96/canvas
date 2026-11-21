# Edge Classes and the Display Control

Status: Built (`acd8a01`, `cd0fe92`)
Applies to: the editable canvas on every profile

## Decision

Every edge gets a **class** (what it means) and an **origin** (where it comes
from). One **Display** control chooses which classes and card types are drawn.
Display changes the view only: stored cards and edges, Review, and canvas or
OpenAPI export are unchanged.

```text
Display: [Minimal] [Standard] [All]   ▸ Classes ☑ flow ☑ contract ☐ structure ☐ annotation ☑ access
                                      ▸ Cards   ☑ System ☑ Repository ☐ Schema ☐ Note ...
                                      "4 cards, 17 edges hidden"
```

This replaces the separate Layers idea. Levels (`docs/levels.md`) decides which
cards a derived view contains; Display decides what the editable canvas draws.

## Class

The ontology already gives each relation type a `category`. Nothing reads it
today, so its values are replaced by the classes below (contract change, no
stored data changes).

| Class | Meaning | Relation types |
| --- | --- | --- |
| `flow` | Runtime dependency and data movement | `uses`, `produces` |
| `contract` | Payload and schema links | `accepts`, `returns`, `references` |
| `structure` | Ownership and containment | `contains`, `defines` |
| `access` | Authentication | `authenticates_via` |
| `annotation` | Notes; the Note kind sets the tone | `relates_to` |
| `unspecified` | No relation type yet ("Define relation") | — |

One exception, in one function `edgeClass(edge, source, target)` in the
contract package: a `uses` edge with a Schema card at either end is `contract`
(a system using a schema, or a schema-to-schema reference), not `flow`.

## Origin

| Origin | Source | Editing |
| --- | --- | --- |
| `explicit` | Drawn by the user | Edit or delete as an edge |
| `managed` | Derived from a card field (`app.managed: true` today: API `accepts`, `returns`, `contains`, `authenticates_via`, `uses`) | Edit through the card; the edge inspector says "Edited through <card name>" with an **Open card** link |
| `inferred` | Exists only in a derived view (Levels lifted edges, `schemaRef` at level 4) | Never stored; not on the editable canvas |

Origin does not decide visibility. It is shown in the edge inspector and the
edge tooltip.

## Presets

| Preset | Classes drawn | Default for |
| --- | --- | --- |
| Minimal | `flow`, `unspecified` | — |
| Standard | `flow`, `contract`, `access`, `unspecified` | Systems, API |
| All | Every class | Raw |

- `unspecified` edges are always drawn: they are Review items and the user must
  see them to fix them.
- Changing a checkbox after choosing a preset shows the preset as **Custom**.
- **API rules stay:** on API canvases the existing rules in
  `openapi/edgeVisibility.ts` (hide `contains`, hide 4xx/5xx `returns`, hide
  default security, draw `uses` only into the next nested column) apply inside
  Minimal and Standard. **All** draws every edge.

## Card types

- One checkbox per card type present on the canvas (with its count). A hidden
  card type hides its cards and every edge to or from them.
- Note cards are one group; their kind sets the tone.
- A hidden card that is the target of a Review "Show" action is revealed for
  that action and the Display summary says so.

## Rules that apply in every preset

1. **Selection reveals:** every edge of a selected card is drawn, whatever its
   class (generalises today's API rule). Hidden card types stay hidden.
2. **Nothing disappears silently:** a chip in the canvas bar shows
   `N cards, M edges hidden` whenever anything is hidden; clicking it opens
   Display. No chip when nothing is hidden.
3. **Review is unaffected:** hidden edges and cards are still checked.
4. **Image export draws what is visible** and its footer names the preset.
   Canvas JSON and OpenAPI export are unchanged.

## Storage

Display is a viewer preference, not part of the design: stored per canvas id in
`localStorage` (`canvas.display.<canvasId>`), never in canvas JSON. A canvas
without a stored choice opens with its profile default. **Reset** returns to
the default.

## Proof

| Risk | Proof seam |
| --- | --- |
| A relation type has no class | Contract test: every ontology relation type has a class |
| Wrong class for `uses` | Table-driven `edgeClass` test, including the Schema exception |
| Wrong edges drawn | Table-driven test: canvas + preset or custom choice + selection -> drawn edge ids, on one Systems and one API fixture (API rules still apply in Standard) |
| Hidden state is invisible | Same test checks the hidden counts |
| UI flow breaks | One E2E: switch to Minimal, see fewer edges and the chip; select a card and see its edges; Reset |

## Contract changes

- `relationCategorySchema` values become `flow`, `contract`, `structure`,
  `access`, `annotation` (the unused `runtime`, `data`, `fallback` go away);
  every relation type sets one. `edgeClass` and `edgeOrigin` helpers.
- No change to stored canvases. No migration.

## Order

After Levels Step 1 lands and is reviewed: both touch the canvas bar and
`CanvasWorkspace.tsx`.
