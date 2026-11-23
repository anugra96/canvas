# Canvas

A lightweight web editor for Obsidian-compatible `.canvas` files.

## Agents

To build or edit canvases through the real UI, as a person would, agents use
the skill in [skills/canvas-ui/SKILL.md](skills/canvas-ui/SKILL.md). It covers
locators, step order, verification, and known limits, with a working reference
that designs `examples/simple-tasks-db.sql` by hand.

## Local development

```bash
npm install
npm run dev
```

The web app runs at `http://127.0.0.1:5173` and proxies `/v1` to the local API
at `http://127.0.0.1:8787`.

Local development uses mock authentication and a file-backed canvas store. No AWS credentials are required.

## Local stack

Run a production-like local stack with S3-compatible storage:

```bash
docker compose up --build -d
# or
make stack-up
```

Open `http://127.0.0.1:8090`. The stack runs the web app behind nginx, the API,
MinIO at `http://127.0.0.1:9000`, and the MinIO console at
`http://127.0.0.1:9001`. The API is also exposed at `http://127.0.0.1:8789`
for diagnostics. Local mock authentication remains enabled.

The API uses `S3CanvasStore` when `CANVAS_STORE=s3`. Objects are stored under
`tenants/<tenant>/canvases/<id>.json` in the configured bucket. File-backed
storage remains the default for `npm run dev`.

```bash
make stack-logs   # follow API and web logs
make stack-down   # stop the stack and keep the MinIO volume
```

Host ports bind to `127.0.0.1` and MinIO images are pinned by digest. To run a
second, independent stack from another checkout, set its name and ports in a
`.env` file next to `docker-compose.yml`:

```bash
CANVAS_STACK_NAME=canvas-next
CANVAS_WEB_PORT=8190
CANVAS_API_HOST_PORT=8889
CANVAS_MINIO_PORT=9100
CANVAS_MINIO_CONSOLE_PORT=9101
```

Each stack name gets its own containers and MinIO volume.

## Commands

```bash
npm run dev        # API and web
npm run test       # all workspace tests
npm run lint       # all workspace lint checks
npm run typecheck  # all workspace type checks
npm run build      # build web and type-check API packages
make verify        # typecheck, lint, unit tests, build, and E2E
make e2e           # Playwright only
make hooks         # once per clone: run make verify before every git push
make deploy-local  # verify, then rebuild and restart api and web on the Docker stack
```

`make deploy-local` deploys the committed `HEAD` only and refuses a dirty tree.
It skips `make verify` when the pre-push hook already passed for that commit.
It tags the running images as `:rollback-<time>`, rebuilds `api` and `web`,
restarts them without touching MinIO, and checks API health, every served
asset, and a headless start-up of the list page. It creates no canvases. If a
check fails, it restores the previous images; on success it prints the
rollback command. GitHub Actions still runs `make verify` on each push as a
clean-checkout backstop.

Install the Playwright browser once per machine before running E2E checks:

```bash
cd web && npx playwright install chromium
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

## Canvas profiles

New canvases can be created as **Raw** or **Systems** canvases. Raw canvases
allow freeform text cards and imports. Systems canvases store profile metadata in
the canvas `app` extension and use a minimal vocabulary:

- System: service, API, database, queue, worker, job, CLI, or external
- Repository: source-code repository, URL, and owner
- Actor: person, role, or team
- Artifact: versioned manifest, image, model, config, or dataset
- Schema: versioned JSON Schema contract shared across systems

Note is the only annotation; its kind (`note`, `decision`, `risk`, `question`)
sets a short label and tone. The profile has four relations: `uses`, `produces`,
`defines`, and `relates_to`.

Schema cards act as real contracts. System/Repository `defines` Schema, and
System/Repository `uses` Schema. Schema-to-schema `uses` records ERD
relationships. The editor meta-validates JSON Schema, shows structure and review
status, and warns when an active API or database System lacks a contract.
Importable examples live in `examples/`.

**Tidy layout** arranges cards with Dagre in a left-to-right hierarchy.
**Fit cards to content** is beside it in the **More** menu.

Edge paths stay intentionally simple. Choose **Bezier**, **Straight**, **Step**,
or **Smooth step** from the **Appearance** popover; the choice persists locally.
Edges keep the handle sides chosen when the connection is created. There is no
obstacle router, implicit side recalculation, or collision solver.

Cards and edges with active validation findings show compact warning/error
badges on the canvas. The **Review** button shows the active count and opens one
panel with **Issues** and **Fixes** tabs. Clicking a warning badge opens Issues at
that exact warning.

Issues is a read-only diagnostic list with collapsed groups, simple rows, and
ignored items. Fixes shows a short title and context per suggestion group.
Expand a group to see every affected item. Each item has **Show** for zooming to
that location and **Fix** for applying the change immediately as one undoable
edit. Show is optional, so Fix works before or after inspecting the location.
The panel remembers the last tab while the editor session remains open.

## Derived views

Systems canvases expose read-only **Derived views** from the toolbar. These
projections never change source cards, positions, or relations; they derive from
the current unsaved editor state.

- **Architecture** shows every architecture card and explicit relation.
- **Runtime** shows actors, systems, and artifacts.
- **Data flow** shows systems, artifacts, and schema contracts.
- **Contracts** shows schemas, their owners, and the surfaces they describe.
- **Pipeline** shows the execution and delivery chain.
- **Sequence** shows a selected System with kind `job` and its nearby participants.

Sequence order is inferred, not authoritative. Inbound `uses` relations appear
first, followed by job `uses` and `produces` relations, then nearby relations.
Relation direction controls sender and receiver. Add or reverse source relations
to change the inferred order.

The Schema workbench includes a derived field table and a tree view. The table
shows field path, type, required state, constraints, and descriptions from the
JSON Schema source.

Systems mode allows arbitrary connections. Unspecified or incompatible relations
are reported in the validation tray and never block editing. Deterministic
semantic check reports one MVP rule: an Artifact needs a producer from a System
or Repository. The rule offers a suggested producer card and `produces` relation. The
standard `.canvas` format is preserved. See
[`docs/systems-profile.md`](docs/systems-profile.md) for the full contract.

## Schema migrations
Persisted canvas documents carry a `schemaVersion`. The current version is `3`.
`migrateCanvasDocument` runs registered migrations whenever a document is read,
so legacy documents remain editable and are stamped on their next save. Future
document-shape changes add an entry to `canvasDocumentMigrations` in
`packages/canvas-contract/src/migrations.ts`.

## Screenshots

Use **More → Screenshot** to export the canvas as a PNG. **Full canvas** fits every card
and edge into the image. **Select area** enters a crop mode where you drag a box
around the region to export. Resolution options are 2x, 3x, and 4x; the output
uses the current theme background and includes the rendered cards, edges, and
labels. Screenshot tooling is local-only and does not upload canvas content.

## Importing Obsidian canvases

Use **Import .canvas** on the canvas list. The list page keeps the brand on the
left, with **Appearance** and the account menu on the right. Canvas parses and validates
the JSON Canvas file, keeps the filename as the title, and preserves nodes,
edges, colors, groups, metadata, and unknown extension fields. Obsidian preset
colors are mapped to their matching palette values.

File nodes are converted to text cards with the file path in bold and the
subpath below. The original path is kept in `app.importedFile`, so no data is
lost. Referenced images, PDFs, and notes are not uploaded or embedded. Link nodes
remain clickable.

## Design language

The shell uses a restrained neutral system: Segoe UI, dense uppercase labels,
square panels, and compact controls. Color themes, backdrop visibility, ambience,
volume, and edge path style live in the **Appearance** popover. Theme choice
persists in `localStorage` under `canvas-theme`.

Theme tokens live in `web/src/themes.css`; layout and component styles live in
`web/src/styles.css`. Add a theme by extending `web/src/themes.ts` and adding a
matching `:root[data-theme="..."]` token block.

Optional background ambience is generated in the browser with the Web Audio
API. No external audio files are used. Procedural ambience loops and volume live
in **Appearance** and can be switched off at any time.

New canvases open with a name dialog. A canvas can also be renamed from its list
card or from the editor title. Renames use the same optimistic `ETag` protection
as canvas saves.

Every card can link to one or more full canvases. The link badge opens a manager
that can link an existing canvas or create a new one with the same profile. Links
are stored as card metadata; canvas content is never inlined. Opening a link uses
a canvas trail with back navigation and cycle protection.

At 720px and below, the editor uses one compact row: back, title, **Add**, and
**More**. The More sheet contains the remaining commands plus Appearance and
account controls. The canvas is full-bleed with one-finger panning, separate
mobile viewport state, and safe-area spacing. Small-phone and mobile flows are
covered by Playwright tests.

On touch devices, card handles stay hidden until you select a card and choose
**Connect**. Then tap another card to create the edge. This avoids invisible
edge handles intercepting drags. Zoom controls are replaced by pinch zoom and
the **Fit view** action in the More menu. Selected cards can be resized by their
larger corner grips or by opening **Size** for exact width and height values.
The selection toolbar has an explicit clear button, and portrait, landscape,
and 320px layouts are covered by E2E tests.

## Ontology

Entity templates live in `packages/canvas-contract/src/ontology.ts`. Each
entity card stores structured fields in the node's `app` extension and a
Markdown summary in `text`. The summary keeps the card readable in Obsidian if
another tool ignores the extension.

Systems templates: system, repository, actor, artifact, schema, and note. Raw
templates also include code and the API and Database profile cards. Text cards render Markdown,
including fenced code blocks. Code cards
use a standard VS Code dark syntax theme and store their language, code, and notes
as structured fields. The code editor supports Tab/Shift+Tab indentation, smart
Enter indentation, auto-closing brackets and quotes, smart backspace, and
Cmd/Ctrl+/ line-comment toggling.

## Keyboard shortcuts

Press `?` or use **More → Keyboard shortcuts**. The shortcut list is generated
from the command registry for Save now, Undo/Redo, Zoom to fit, and Help, and
also covers duplicate, select all, group selection, zoom to selection, arrow-key
nudging, space-drag panning, and command/control-scroll zooming.

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
Select an edge to reverse its direction, choose its relation, or change its
color. Drag an edge endpoint to reconnect it to another side or card.
Edge labels do not block card dragging. Clicking outside a card finishes editing
and lets autosave persist the change. Text cards and card note fields open in a
plain Markdown editor with **Raw** and **Preview** modes. Preview is a rendered
Markdown surface that remains fully editable, so formatting can be edited in
place while the Markdown source updates. Raw mode gives the full width to the
source. List continuation, ordered-list incrementing, tab indentation, and
bold/italic/inline-code shortcuts remain available.

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
docs/                       Product and contract notes
```
