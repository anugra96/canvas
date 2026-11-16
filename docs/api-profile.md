# API Profile Contract

Status: Proposed v1 (spec agreed 2026-11-16, not built)
Profile ID: `api`
Version: `1`
Format: OpenAPI 3.1 (JSON and YAML), JSON Schema 2020-12

## Decision

Canvas gets a third profile, **API**, next to Raw and Systems. An API canvas
designs one HTTP API at endpoint level. A Systems canvas stays at architecture
level and links to the API canvas from the System card with kind `api`.

OpenAPI 3.1 is the exchange format. Import gives an accurate canvas from an
existing service. Export gives a spec that code generators, docs tools, and
gateways accept. Canvas is a design surface for OpenAPI, not a competing format.

```text
Systems canvas   [Pipeline] ──uses (POST /v1/jobs)──> [System: Engine API] ⇢ linked API canvas

API canvas       [API: Skyward Engine API 0.1.0]
                   ├─contains─> [Resource: Jobs] ─contains─> [GET /v1/jobs]       ─returns 200─> [Schema: JobList]
                   │                             ─contains─> [POST /v1/jobs]      ─accepts─────> [Schema: JobCreate]
                   │                                                              ─returns 422─> [Schema: ApiErrorResponse]
                   └─contains─> [Security: BearerAuth] <─authenticates_via─ Jobs
```

## Cards

| Card | Entity id | OpenAPI source | Responsibility |
| --- | --- | --- | --- |
| API | `api_definition` | `openapi`, `info`, `servers`, top-level `security`, `tags` order | One per canvas. Title, version, servers, global security |
| Resource | `resource` | One `tags` entry | Groups endpoints by business resource |
| Endpoint | `endpoint` | One Operation object under `paths.<path>.<method>` | One method and path |
| Schema | `schema` (reused) | One `components.schemas` entry | A named model. Same card, workbench, and Ajv validation as Systems |
| Security | `security_scheme` | One `components.securitySchemes` entry | How callers authenticate |

Annotations: Note, Decision, Risk (shared with Systems).

The ids `api` and `service` already exist as legacy entity types, so the new
cards use new ids. Labels shown to users are API, Resource, Endpoint, Schema,
and Security.

### Fields

| Card | Fields |
| --- | --- |
| API | Title, Version, Description, Servers (one URL per line), Owner, Status, Review status, Reviewed version, Last reviewed, Review interval, Extra (JSON, read-only in v1) |
| Resource | Name, Description, Owner |
| Endpoint | Method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE), Path, Status (planned, active, deprecated), Operation (JSON) |
| Schema | Unchanged. Contract kind defaults to `api` on API canvases |
| Security | Name, Type (http, apiKey, oauth2, openIdConnect, mutualTLS), Description, Definition (JSON) |

## One source of truth per fact

This is the main design rule. Every OpenAPI fact is stored once.

| Fact | Stored in | Notes |
| --- | --- | --- |
| Method and path | Endpoint fields | The path is the card title |
| Summary, description, operationId, parameters, request body, responses, security, deprecated, callbacks, `x-*` | Endpoint `operation` field, verbatim Operation object | Edited through the Endpoint inspector; a Raw tab shows the JSON |
| Resource membership | `operation.tags[0]` | Further tags are kept. An untagged endpoint joins an inferred Resource (see Import) |
| A named model | Schema card `source` | `$ref: "#/components/schemas/<Name>"` resolves by the Schema card name |
| Security scheme | Security card `definition` | |
| Status `deprecated` | Endpoint Status field | Export writes `deprecated: true`; import reads it |
| Anything else in the document (`webhooks`, `jsonSchemaDialect`, `externalDocs`, other `components`, `x-*` at the top level) | API card `extra`, verbatim | Shown in the inspector; re-emitted on export |

### Managed relations

The relations from an Endpoint are a view of its operation, so they cannot
disagree with it.

| Relation | Source -> target | Derived from |
| --- | --- | --- |
| `contains` | API -> Resource, Security; Resource -> Endpoint | `tags`; scheme list |
| `accepts` | Endpoint -> Schema | `requestBody.content.*.schema.$ref` |
| `returns` | Endpoint -> Schema | `responses.<status>.content.*.schema.$ref`; the edge label shows the status, for example `201` or `4XX` |
| `authenticates_via` | API, Resource, or Endpoint -> Security | Top-level, then operation `security` |
| `uses` | Schema -> Schema | `$ref` inside a schema (as in Systems) |
| `relates_to` | Annotations <-> anything | Drawn by hand |

- Managed edges carry `app.managed: true` plus `app.status` and `app.mediaType`
  where they apply. The editor regenerates them when an operation, a schema, or
  a tag changes, as one undoable edit with that change.
- Drawing a new edge from an Endpoint to a Schema opens a small chooser:
  **Request body** or **Response** with a status code. The choice edits the
  operation, and the edge follows from it. Deleting a managed edge removes the
  reference from the operation, after a confirm when the response has other
  content.
- Drawing from a Schema to a Schema adds a `$ref` property only after the user
  names the property; otherwise it stays an ordinary `uses` relation for ERD
  reading, as today.
- Inline schemas (no `$ref`) stay inside the operation and draw no edge. The
  inspector offers **Extract to model**, which creates a Schema card and
  replaces the inline schema with a `$ref`.

### Card previews

A card preview shows the design, never raw JSON. The `operation`, `extra`, and
`definition` JSON fields appear only in the inspector (the Endpoint Raw tab and
the read-only API and Security fields). Previews are built from
`buildApiReference()`, the same summary the Reference view uses, so the card and
the docs cannot disagree.

```text
┌ GET  /tasks ─────────────────── 🔒 BearerAuth ┐
│ List tasks                                    │
│ ?limit  ?cursor                               │
│ 200 → TaskList    422 → ApiError              │
└───────────────────────────────────────────────┘
```

| Card | Preview |
| --- | --- |
| Endpoint | Title: method badge (one colour per method) and the path in monospace, with `{params}` highlighted. Then the summary; parameter chips (`{path}`, `?query`, `header:`; required marked); `body → Model` for a request body; response chips `status → Model`, coloured 2xx/3xx, 4xx, 5xx; a lock with the scheme name, or `public` for `security: []`; deprecated shows the path struck through with a badge. Default width 360, height fits content |
| API | Title, version badge, servers, a two-line description, counts (resources, endpoints, schemas), and global security |
| Resource | A lane: a frame around its endpoints with the name, description, and owner in its header. It does not list the endpoints again (see Layout) |
| Security | Type and scheme in words (for example "HTTP bearer (JWT)") and "used by N endpoints" |
| Schema | The existing Schema preview at a compact default size (360 wide). Review badges are not shown on API canvases (see Contract review) |

### Drawn edges

Managed relations are all stored, so views and export see the full model. The
canvas draws only the edges that carry information the cards and layout do not
already show:

| Relation | Drawn on the canvas |
| --- | --- |
| `contains` | Never. The Resource lane shows membership |
| `authenticates_via` | Only from an Endpoint or Resource whose security differs from the API's. The API card and each endpoint's lock show the rest |
| `returns` | Only for `1XX`, `2XX`, and `3XX` statuses, from the endpoint's right side to the model's left side, labelled with the status. Error responses appear as chips on the Endpoint card |
| `accepts` | From the model's right side into the endpoint's left side. The stored edge stays Endpoint -> Schema; it sets `fromEnd: "arrow"` and `toEnd: "none"` so the arrow points into the endpoint |
| `uses` | Always, drawn away from the endpoints: rightwards on the response side, leftwards on the request side. Between two models in the same column, from the upper card's bottom to the lower card's top |
| `relates_to` | Always |

Selecting a card shows all its managed edges, including hidden ones, until the
selection changes.

### Contract review

On an API canvas the API is the reviewed contract, not each model. The schema
review fields and the "Schema review due" warning apply to the API card
(version, review status, reviewed version, last reviewed, interval). Schema
cards on API canvases raise no review warnings and no combined warning on the
API card for them; the API card's own review fields decide. JSON Schema parse and
meta-validation errors still apply to every Schema card. This applies from
Phase 1, so an import does not start with one review warning per model.

### Layout

An API canvas reads left to right as request, endpoint, response.

```text
┌ API: Simple Tasks API v1.0.0 · 🔒 BearerAuth ┐ ┌ Security: BearerAuth ┐       header row

 REQUEST MODELS        ENDPOINTS (one lane per Resource)        RESPONSE MODELS
                       ┌ Tasks ───────────────────────────┐
                       │ GET    /tasks            ──200───┼──▶ TaskList ──uses──▶ Task
 TaskCreate ──body──▶  │ POST   /tasks            ──201───┼──▶ Task
                       │ GET    /tasks/{task_id}  ──200───┼──▶ Task
 TaskUpdate ──body──▶  │ PATCH  /tasks/{task_id}  ──200───┼──▶ Task
                       │ DELETE /tasks/{task_id}          │
                       └──────────────────────────────────┘
                       ┌ Health ──────────────────────────┐
                       │ GET    /healthz          ──200───┼──▶ Health
                       └──────────────────────────────────┘
 Shared: ApiError                                                         shared row
```

(Each model card appears once; the diagram repeats `Task` only to show which
rows point at it.)

| Rule | Detail |
| --- | --- |
| Header row | API card, then Security cards to its right |
| Columns | Request models; endpoint lanes; response models. Nested models get one extra column per `uses` depth, moving away from the lanes: a model referenced by a response model goes one column further right; a model referenced by a request model goes one column further left (the lanes and response columns shift right to make room). A model reachable from both sides goes on the response side |
| A model used both as a request and a response | Response column |
| Shared row | A model referenced only by `4XX`/`5XX` responses, and by no success response or request, goes in a row below the lanes. It draws no response edges. Models it references go in the same row to its right |
| Unused models | After the shared row, in name order |
| Resource lanes | Tag order, then inferred Resources by name. The lane is the Resource card, sized to enclose its endpoints with 24 px padding and a header |
| Endpoint order in a lane | Path segments in order with collection paths before item paths (`/tasks` before `/tasks/{task_id}`), then GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE |
| Model position in a column | Each model's target top is the top of the first endpoint (or model) that references it. Models are placed in target order at `max(target, previous bottom + 40)`, so a model sits level with its first user unless the card above pushes it down. Ties by name. Request models therefore sit beside their endpoints, never below the lanes |
| Canvas height | No referenced model is placed below the shared row; only unused models go there |
| Spacing | 80 px between columns, 24 px between endpoints in a lane, 40 px between lanes and between models. No overlaps |
| Drag | Moving a Resource lane moves its endpoints, reusing the group-drag behaviour. An endpoint dropped into another lane does not change its tag; only the inspector does |
| New cards | A new Endpoint goes at the end of its Resource's lane; a new Schema goes at the end of the column its references put it in (unreferenced: the unused area); a new Resource lane goes below the last lane. Nothing else moves, except that the lane grows to enclose a new endpoint |
| Endpoint outside its lane | When an endpoint is dropped partly or fully outside its Resource lane, the lane grows to enclose it again. A lane never shrinks on its own; **Tidy API layout** compacts it |

The layout is a pure function, `layoutApiCanvas(canvas, sizes)`, in
`packages/canvas-contract/src/openapi/layout.ts`. Import calls it with estimated
card sizes (from the reference summary: title, summary, chip rows). The editor's
**Tidy API layout** command calls it with measured sizes and applies the result
as one undoable edit. It changes positions and lane sizes only.

The layout is a suggestion, not a constraint. It runs only on import and when
the user runs **Tidy API layout**. Every card can be moved freely, positions are
saved, and nothing is rearranged without that command. There is no automatic
re-layout after edits.

## Profile metadata

```json
{ "app": { "profile": "api", "profileVersion": 1 } }
```

`API_PROFILE` is added to `DEFAULT_PROFILES`. The list page profile picker
offers Raw, Systems, and API. Untyped text and unlisted types are warnings, as
in Systems.

## Design tools

Each tool is deterministic and works offline. Pure logic lives in
`packages/canvas-contract/src/openapi/` so the web app, the API, and a later MCP
server share it. UI lives in `web/src/canvas/apiDesign/`.

### Phase 1: model and import

1. **API profile and cards**, with the managed relations above.
2. **Import OpenAPI 3.1** from a pasted document or a file, JSON or YAML (adds
   the `yaml` package). Import creates a new canvas laid out as in Layout. OpenAPI 3.0 is converted on import (`nullable`, `example`,
   `exclusiveMinimum`) with a summary of what changed. Swagger 2.0 is refused
   with a message.
   Untagged operations are grouped into an **inferred Resource** named after the
   first path segment that is not a version (`/v1/jobs/{job_id}` -> `jobs`;
   `/healthz` -> `healthz`). Inferred Resources carry `app.inferred: true` and
   add no tag on export, so the round trip stays exact. Renaming an inferred
   Resource or adding a description makes it a real tag.
3. **Endpoint inspector** in the side panel, replacing the raw field editor for
   Endpoint cards: method and path, summary and description, a parameter table
   (name, in, required, type, description), the request body model, a response
   list (status, description, model), and security. A Raw tab edits the
   operation JSON. Path parameters are detected from `{name}` in the path and
   added to the table.
4. **Reference view**: a read-only derived view that reads like API docs.
   Endpoints are grouped by Resource with method badges, parameters, request
   and response models, and status codes. It reuses the derived views
   framework.
5. **Tidy API layout** command (see Layout).
6. **Create or open API canvas** command on a Systems card with kind `api`. It
   creates an API canvas titled after the card and adds a canvas link.

### Phase 2: design faster

7. **Export OpenAPI 3.1** as JSON or YAML, downloaded or copied. Export sorts
   paths by Resource order, then path, then method, so diffs stay small.
8. **Add resource** command: asks for a singular and a plural name, then creates
   a Resource, list, get, create, update, and delete endpoints, and the
   `<Name>`, `<Name>Create`, `<Name>Update`, and `<Name>List` schemas with
   cursor pagination. The user removes what is not needed.
9. **Standard errors**: one command adds an RFC 9457 Problem Details schema and
   attaches it to `4XX` and `5XX` responses on the selected endpoints.
10. **Examples**: generate an example from a schema (deterministic: first enum
   value, `format`-aware placeholders, minimum lengths), and validate every
   example in the document against its schema with Ajv.
11. **Request snippet**: copy a `curl` command for the selected endpoint using
    the first server, its path parameters, and an example body.

### Phase 3: review and change safety

12. **API checks** in the existing Review panel, with the same Issues, Fixes,
    and ignore-with-reason behaviour.

    | Code | Severity | Rule |
    | --- | --- | --- |
    | `operation_invalid` | Error | The operation does not validate against the OpenAPI 3.1 Operation schema |
    | `ref_unresolved` | Error | A `$ref` names no Schema card or `extra` component |
    | `operation_duplicate` | Error | Two endpoints share a method and path, or an operationId |
    | `path_parameter_mismatch` | Error | A `{name}` in the path without a path parameter, or the reverse |
    | `response_success_missing` | Warning | No `2XX` or `3XX` response |
    | `mutation_errors_missing` | Warning | POST, PUT, PATCH, or DELETE without a `4XX` response |
    | `security_missing` | Warning | No security at any level. Explicit `security: []` marks a public endpoint and passes |
    | `list_pagination_missing` | Warning | A GET whose success schema is an array or has an array `items` property, without a limit or cursor parameter |
    | `get_with_body` | Warning | GET or DELETE with a request body |
    | `naming_inconsistent` | Warning | A path segment, parameter, or property name differs from the canvas's majority case style |
    | `schema_unused` | Warning | A Schema card no endpoint or schema references |
    | `endpoint_without_resource` | Warning | No tag (inferred Resources count as a tag only for layout, so this still reports) |

    Fixes are offered where the repair is unambiguous: add the missing path
    parameter, attach standard errors, add `limit` and `cursor`, add a tag.

13. **Breaking-change check**: compare the canvas with an OpenAPI file or with
    another API canvas (version history can be a source once it exists). The
    result lists Breaking and Compatible changes per endpoint:

    | Breaking | Compatible |
    | --- | --- |
    | Endpoint removed; method or path changed | Endpoint added |
    | Response status removed; response property removed or its type changed | Response property added (flagged when the schema forbids additional properties) |
    | Request property or parameter newly required; required parameter added | Optional request property or parameter added |
    | Request enum value removed; response enum value added (warning) | Request enum value added |
    | Security added to a public endpoint | Description and example changes |

    **Copy changelog** gives a Markdown summary of the comparison.

### Phase 4: tie into Systems

14. A Systems `uses` relation to a System with kind `api` gets an optional
    **Endpoint** picker that lists the endpoints of its linked API canvas and
    stores `app.endpoint: "POST /v1/jobs"`. The edge label shows it, and the
    Sequence view uses it as the message text.
15. The Review panel warns when a stored endpoint no longer exists in the linked
    API canvas.

### Later, not in this spec

| Tool | Why later |
| --- | --- |
| Import from a URL | Fetching through the API is a server-side request risk; needs an allow list |
| Mock server from examples | New runtime surface in the API; design it with the deployment platform |
| Client and server code generation | Export plus existing generators (openapi-generator, openapi-typescript) already cover it |
| AsyncAPI events, GraphQL, gRPC | Different contracts; a separate profile each, only on demand |
| Live "try it" requests | Needs credentials handling and CORS; out of scope for a design tool |

## Proof

| Risk | Proof seam |
| --- | --- |
| Import or export loses data | Round-trip test in the contract package: import, export, and deep-equal after key sorting, for both fixtures below and one synthetic document that uses every supported feature plus `webhooks` and `x-*` extensions |
| Managed relations drift from operations | Table-driven test: operation edit -> expected managed edges |
| Layout is unreadable | Table-driven layout test on both fixtures and the example: every referenced model's top is at or below its first user's top and within one card height plus 40 px of it unless pushed by the card above; nested request models are left of their parent; on the Engine fixture no referenced model is below the shared row. Plus placing a new endpoint and a new schema (nothing else moves) and dropping an endpoint outside its lane (the lane grows): no overlaps; every endpoint inside its lane; request models left of lanes and response models right; no drawn edge points leftwards except `accepts` into an endpoint; same input gives the same positions |
| Canvas shows noise or hides a fact | Table-driven test: relation, status, and security override -> drawn or hidden. Browser check: the imported sample at fit view and one Endpoint card at 100%, with no raw JSON on any card |
| Checks are wrong | One table-driven test per rule family with a passing and a failing operation |
| Breaking-change check misses a break | Table-driven test with one pair of documents per row in the table above |
| UI flow breaks | One E2E test: import the Engine fixture, open an endpoint, add a response, export, and confirm the exported document contains it |

Fixtures (copy into `packages/canvas-contract/src/openapi/fixtures/` with their
source noted):

- `skyward-engine/docs/openapi/skyward-engine-v1.json`: OpenAPI 3.1.0,
  6 operations, 20 schemas, `BearerAuth`.
- `skyward-api-aws/openapi-alaska.yaml`: OpenAPI 3.1.0 in YAML.

Acceptance: importing the Engine fixture (it has no tags) gives 1 API, inferred
Resources `healthz`, `jobs`, and `products`, 6 Endpoints, 20 Schemas, and 1 Security card with zero errors in the Review
panel (warnings are expected and listed in the test), and exporting it gives a document equal to the original after
normalization.

## Contract changes

- `packages/canvas-contract`: `API_PROFILE`; entity types `api_definition`,
  `resource`, `endpoint`, `security_scheme`; relation types `accepts`,
  `returns` (`contains` and `authenticates_via` already exist); edge meta fields
  `managed`, `status`, `mediaType`, `endpoint`; node meta field `inferred`; `openapi/` module (import, layout,
  export, managed relations, checks, diff).
- No change to stored Systems or Raw canvases. No migration.
- The API stores and serves API canvases like any other document.

## Decisions

| Decision | Choice | Strongest challenge |
| --- | --- | --- |
| Where endpoints live | A separate API canvas linked from Systems | One canvas is simpler to open; but it drowns the architecture view |
| Source of truth | Verbatim Operation object on the Endpoint; relations are derived | Editable edges feel more "canvas"; but two writable copies drift. Drawing an edge still works because it edits the operation |
| Models | Reuse the Schema card | A separate Model card could hide contract-review fields; reuse keeps one workbench and one validator |
| Resource | A card mapped to an OpenAPI tag | A group would be lighter; but groups are not graph endpoints, and tags carry order and descriptions |
| YAML | Add the `yaml` package | One more dependency; most hand-written specs are YAML |
