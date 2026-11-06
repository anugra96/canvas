# Skyward Canvas

A lightweight web editor for Obsidian-compatible `.canvas` files.

## Local development

```bash
npm install
npm run dev
```

The web app runs at `http://127.0.0.1:5173` and proxies `/v1` to the local API
at `http://127.0.0.1:8787`.

Local development uses mock Skyward authentication and a file-backed canvas
store. No AWS credentials are required.

## Commands

```bash
npm run dev        # API and web
npm run test       # all workspace tests
npm run lint       # all workspace lint checks
npm run typecheck  # all workspace type checks
npm run build      # build web and type-check API packages
```

## Runtime ontology

The web app loads the ontology from `GET /v1/ontology` after sign-in. The API
returns the built-in ontology unless `CANVAS_ONTOLOGY_PATH` points to a JSON
configuration file. The file is validated against the ontology schema and cached
by modification time. Invalid files fall back to the built-in ontology.

To customize templates without a frontend deploy:

1. Fetch the current configuration from `/v1/ontology`.
2. Edit the JSON.
3. Set `CANVAS_ONTOLOGY_PATH` to that file.
4. Reload the app.

The configuration controls entity types, fields, colors, icons, default sizes,
and relation types.

## Importing Obsidian canvases

Use **Import .canvas** on the canvas list. Skyward Canvas parses and validates
the JSON Canvas file, keeps the filename as the title, and preserves nodes,
edges, colors, groups, metadata, and unknown extension fields. Obsidian preset
colors are mapped to their matching palette values.

File nodes are converted to text cards with the file path in bold and the
subpath below. The original path is kept in `skyward.importedFile`, so no data is
lost. Referenced images, PDFs, and notes are not uploaded or embedded. Link nodes
remain clickable.

## Design language

The shell follows the Skyward FCC/Vista family: dark teal chrome, cyan accents,
Segoe UI, dense uppercase labels, and square panels. Shared tokens live at the
top of `web/src/styles.css`.

## Ontology

Entity templates live in `packages/canvas-contract/src/ontology.ts`. Each
entity card stores structured fields in the node's `skyward` extension and a
Markdown summary in `text`. The summary keeps the card readable in Obsidian if
another tool ignores the extension.

Current templates: repository, database, service, API, decision, risk, code,
and note. Text cards render Markdown, including fenced code blocks. Code cards
use a standard VS Code dark syntax theme and store their language, code, and notes
as structured fields.

## Keyboard shortcuts

Press `?` or use the keyboard button in the editor toolbar. Shortcuts cover
undo/redo, duplicate, select all, group selection, fit view, zoom to selection,
arrow-key nudging, space-drag panning, and command/control-scroll zooming.

Drag a connection to empty canvas space to open the template picker. The new card
is created and connected in one step. Double-click an edge or its label to edit
the label. The selection toolbar provides group, color, duplicate, and delete
actions.

The canvas uses a neutral grey surface. Card colors fill the full card background
and outline. Groups have no outline; their filled area defines the group. Dragging
a card near another card's or group's edges or centers snaps it and shows
alignment guides. Hold Alt while dragging to disable snapping.

Edges render above cards and groups. Every edge leaves and enters perpendicular
to the side of the card it connects to. Opposite aligned sides stay straight;
diagonal, top/bottom, and same-side connections curve based on those handle sides.
Select an edge to reverse its direction or change its color. Drag an edge endpoint
to reconnect it to another side or card.
Edge labels do not block card dragging. Clicking outside a card finishes editing
and lets autosave persist the change. Text cards support
Markdown list continuation, ordered-list incrementing, tab indentation, and
bold/italic/inline-code shortcuts.

Groups use explicit membership. Creating a group captures the selected cards.
Dragging another card over the group does not capture it. Select a group plus one
or more cards to add or remove members from the selection toolbar. The canvas
viewport is persisted per canvas, so reloads keep the current pan and zoom.

## Layout

```text
web/                        React editor
api/                        Hono canvas API
packages/canvas-contract/   JSON Canvas types, validation, merge
mcp/                        MCP server scaffold
```
